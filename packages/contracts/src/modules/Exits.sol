// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SharesMath} from "../libraries/SharesMath.sol";
import {Membership} from "./Membership.sol";
import {Ledger} from "./Ledger.sol";
import {Rules} from "./Rules.sol";

/// @title Exits
/// @notice Leaving a circle (ADR 0039): ask to exit, wait out the notice, then get your shares
///         paid in AVAX at the value they have on the day you are paid, minus the exit fee. The
///         fee stays in the circle. Payouts go first come, first served. Anyone can process the
///         queue (Chainlink Automation does it by default), and you can always collect yourself.
///         Also holds the guardian pause (ADR 0020): it stops new loans and joins for at most
///         14 days, once per 90 days, and never stops an exit, a claim or a repayment.
/// @dev External library (ADR 0031, 0037), delegatecalled by the vault with the vault's storage.
///      The only writer of `Ledger.exitsWaiting` and `Ledger.pausedUntil`.
///
///      Queue: `queue` is append-only and `head` skips the settled prefix. A slot `i` is live
///      only while `entries[queue[i]].slot == i + 1`; cancelled, paid or dropped exits leave a
///      stale slot behind, which scans skip. One live exit per member.
///
///      `Ledger.exitsWaiting` = live exits marked `waiting`: their notice has ended and a payout
///      attempt (process, claim or upkeep) found too little cash, or found an earlier exit still
///      waiting (first come, first served). The mark is cleared when the exit is paid, cancelled
///      or dropped, so the counter is exact. LoanBook lends nothing while it is above 0 (RT-17).
library Exits {
    using Ledger for Ledger.Store;

    // ------------------------------------------------------------------ types

    struct Entry {
        uint64 requestedAt;
        /// @dev When the notice ends and the exit can be paid (UTC seconds).
        uint64 maturesAt;
        /// @dev Queue index + 1; 0 = no exit pending.
        uint32 slot;
        /// @dev Exit fee in force when the member asked. The lower of this and the fee at
        ///      payout applies, so a rule change can't raise the fee on someone already leaving.
        uint16 feeBps;
        /// @dev Counted in `Ledger.exitsWaiting`.
        bool waiting;
    }

    struct Store {
        address[] queue;
        uint256 head;
        mapping(address member => Entry) entries;
        /// @dev Start of the guardian's last pause (0 = never).
        uint64 lastPauseAt;
    }

    enum DropReason {
        /// @dev No longer a member (for example, removed by a dissolution).
        NotAMember,
        /// @dev Frozen by a loan default after asking to exit.
        Frozen,
        /// @dev Took on a loan, a loan request or a guarantee after asking to exit.
        LoanTies
    }

    // ------------------------------------------------------------------ constants

    /// @dev Longest guardian pause (ADR 0020).
    uint64 internal constant PAUSE_LENGTH = 14 days;
    /// @dev Time from one pause starting to the next allowed one (RT-14).
    uint64 internal constant PAUSE_COOLDOWN = 90 days;
    /// @dev Queue slots one Chainlink upkeep looks at.
    uint256 internal constant UPKEEP_BATCH = 20;
    /// @dev Gas a payout transfer may use: enough for a smart wallet, too little to burn the
    ///      batch (RT-20). No return data is copied, so a return bomb costs nothing.
    uint256 internal constant PAYOUT_GAS = 50_000;
    /// @dev A batch stops before an exit when less gas than this is left, so the last payout
    ///      never runs out of gas half way.
    uint256 internal constant MIN_GAS_PER_EXIT = 150_000;
    uint256 private constant BPS = 10_000;

    // ------------------------------------------------------------------ events

    event ExitRequested(address indexed member, uint256 maturesAt, uint256 feeBps);
    event ExitCancelled(address indexed member);
    /// @notice The notice has ended but the circle can't pay yet (cash is lent out, or someone
    ///         ahead in the queue is still waiting). New loans stop until it is paid.
    event ExitWaiting(address indexed member, uint256 payout, uint256 cash);
    event ExitPaid(
        address indexed member, uint256 shares, uint256 value, uint256 fee, uint256 payout
    );
    /// @notice The exit was taken off the queue because the member can't exit any more.
    event ExitDropped(address indexed member, DropReason reason);
    event GuardianPaused(address indexed guardian, uint256 until);
    event GuardianUnpaused(address indexed by);

    // ------------------------------------------------------------------ errors

    error ExitAlreadyPending(uint256 maturesAt);
    error NoExitPending();
    error ExitNotReady(uint256 maturesAt);
    error MemberFrozen(address member);
    error HasLoanTies(address member, uint256 ties);
    error NotGuardian();
    error GuardianOff();
    error PauseTooSoon(uint256 allowedAt);
    error NotPaused();
    /// @notice The guardian paused new loans and joins until `until` (ADR 0020).
    error CirclePaused(uint256 until);

    // ------------------------------------------------------------------ member actions

    /// @notice Ask to leave. Notice = `exitNoticeDays`, or none during a rage-quit window
    ///         (ADR 0019). Dormant members may exit: their shares are theirs.
    function requestExit(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r
    ) external {
        Membership.Member storage m = ms.members[msg.sender];
        if (!m.active) revert Membership.NotAMember(msg.sender);
        if (m.frozen) revert MemberFrozen(msg.sender);
        if (m.loanTies != 0) revert HasLoanTies(msg.sender, m.loanTies);
        Entry storage e = s.entries[msg.sender];
        if (e.slot != 0) revert ExitAlreadyPending(e.maturesAt);

        uint64 nowTs = SafeCast.toUint64(block.timestamp);
        uint64 notice = nowTs < ledger.rageQuitUntil ? 0 : uint64(r.exitNoticeDays) * 1 days;
        s.queue.push(msg.sender);
        uint64 maturesAt = nowTs + notice;
        s.entries[msg.sender] = Entry({
            requestedAt: nowTs,
            maturesAt: maturesAt,
            slot: SafeCast.toUint32(s.queue.length),
            feeBps: r.exitFeeBps,
            waiting: false
        });
        emit ExitRequested(msg.sender, maturesAt, r.exitFeeBps);
    }

    /// @notice Stay after all. Works any time before the payout.
    function cancelExit(Store storage s, Ledger.Store storage ledger) external {
        Entry storage e = s.entries[msg.sender];
        if (e.slot == 0) revert NoExitPending();
        _clear(s, ledger, msg.sender, e);
        // Drop settled slots from the tail so request/cancel spam can't grow the queue that
        // keepers scan. Each slot is popped at most once for the push that made it.
        address[] storage q = s.queue;
        uint256 len = q.length;
        while (len > s.head && s.entries[q[len - 1]].slot != len) {
            q.pop();
            --len;
        }
        emit ExitCancelled(msg.sender);
    }

    /// @notice Collect your own exit once the notice has ended (RT-21: no keeper needed). Pays
    ///         at once unless other exits are already waiting for cash; then you keep your place
    ///         and `processExits` pays the queue in order.
    /// @return paid True if the payout was made (or kept for `withdraw`, if your wallet refused).
    function claimExit(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r
    ) external returns (bool paid) {
        Entry storage e = s.entries[msg.sender];
        if (e.slot == 0) revert NoExitPending();
        if (block.timestamp < e.maturesAt) revert ExitNotReady(e.maturesAt);
        bool mayPay = ledger.exitsWaiting == 0 || (e.waiting && ledger.exitsWaiting == 1);
        return _settle(s, ledger, ms, r, msg.sender, mayPay) == Outcome.Paid;
    }

    /// @notice Settle up to `maxCount` queue slots from the front, first come, first served.
    ///         Anyone can call it. Once an exit can't be paid, the ones behind it wait too.
    /// @return paid Exits paid in this call.
    function processExits(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r,
        uint256 maxCount
    ) external returns (uint256 paid) {
        uint256 len = s.queue.length;
        uint256 i = s.head;
        uint256 end = maxCount > len - i ? len : i + maxCount;
        uint256 newHead = i;
        bool prefixDone = true;
        bool blocked = false;
        for (; i < end; ++i) {
            if (gasleft() < MIN_GAS_PER_EXIT) break;
            address who = s.queue[i];
            bool done = s.entries[who].slot != i + 1;
            if (!done) {
                Outcome outcome = _settle(s, ledger, ms, r, who, !blocked);
                if (outcome == Outcome.Paid) ++paid;
                if (outcome == Outcome.Waiting) blocked = true;
                done = outcome == Outcome.Paid || outcome == Outcome.Dropped;
            }
            if (prefixDone && done) newHead = i + 1;
            else prefixDone = false;
        }
        s.head = newHead;
    }

    // ------------------------------------------------------------------ guardian (ADR 0020)

    /// @notice Pause new loans and joins for 14 days. Only the guardian (the circle's creator,
    ///         while still a member), only if the circle hasn't voted the guardian off, and at
    ///         most once per 90 days (RT-14). Exits, claims and repayments keep working.
    function pause(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        address g
    ) external {
        if (msg.sender != g || !ms.members[g].active) {
            revert NotGuardian();
        }
        if (ledger.guardianDisabled) revert GuardianOff();
        uint64 nowTs = SafeCast.toUint64(block.timestamp);
        uint64 last = s.lastPauseAt;
        if (last != 0 && nowTs < last + PAUSE_COOLDOWN) revert PauseTooSoon(last + PAUSE_COOLDOWN);
        s.lastPauseAt = nowTs;
        uint64 until = nowTs + PAUSE_LENGTH;
        ledger.pausedUntil = until;
        emit GuardianPaused(msg.sender, until);
    }

    /// @notice End the pause early. The guardian can; if the guardian was voted off or has left
    ///         the circle, anyone can, so a pause never outlives its guardian.
    function unpause(Ledger.Store storage ledger, Membership.Store storage ms, address g) external {
        if (!ledger.paused()) revert NotPaused();
        bool guardianGone = ledger.guardianDisabled || !ms.members[g].active;
        if (msg.sender != g && !guardianGone) revert NotGuardian();
        ledger.pausedUntil = SafeCast.toUint64(block.timestamp);
        emit GuardianUnpaused(msg.sender);
    }

    // ------------------------------------------------------------------ views

    /// @notice Chainlink Automation: true if `processExits` would pay, mark or drop something in
    ///         the next `UPKEEP_BATCH` slots. Mirrors `processExits` without writing.
    function upkeepNeeded(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r
    ) external view returns (bool) {
        uint256 len = s.queue.length;
        uint256 i = s.head;
        uint256 end = UPKEEP_BATCH > len - i ? len : i + UPKEEP_BATCH;
        uint256 cash = ledger.cash();
        bool blocked = false;
        for (; i < end; ++i) {
            address who = s.queue[i];
            Entry storage e = s.entries[who];
            if (e.slot != i + 1 || block.timestamp < e.maturesAt) continue;
            Membership.Member storage m = ms.members[who];
            if (!m.active || m.frozen || m.loanTies != 0) return true;
            if (!blocked) {
                (,,, uint256 payout) = _quote(ledger, r, m.shares, e.feeBps);
                if (payout <= cash) return true;
                blocked = true;
            }
            if (!e.waiting) return true;
        }
        return false;
    }

    /// @notice What `member` would receive if paid right now (0 if not a member).
    function exitValue(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r,
        address member
    ) external view returns (uint256 payout) {
        Membership.Member storage m = ms.members[member];
        if (!m.active) return 0;
        Entry storage e = s.entries[member];
        uint16 feeBps = e.slot != 0 ? e.feeBps : r.exitFeeBps;
        (,,, payout) = _quote(ledger, r, m.shares, feeBps);
    }

    /// @notice Queue slots from the front (`head + offset`), bounded by `limit`. Settled slots
    ///         come back as address(0); read each exit with the vault's `exitOf`.
    function queuePage(Store storage s, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory who)
    {
        uint256 len = s.queue.length;
        uint256 start = s.head + offset;
        if (start >= len) return who;
        uint256 end = len - start > limit ? start + limit : len;
        who = new address[](end - start);
        for (uint256 i = start; i < end; ++i) {
            address a = s.queue[i];
            if (s.entries[a].slot == i + 1) who[i - start] = a;
        }
    }

    // ------------------------------------------------------------------ internals

    enum Outcome {
        NotReady,
        Paid,
        Dropped,
        Waiting
    }

    /// @dev Pays, drops or marks one live exit. Effects first; the transfer is the last step.
    function _settle(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r,
        address who,
        bool mayPay
    ) private returns (Outcome) {
        Entry storage e = s.entries[who];
        if (block.timestamp < e.maturesAt) return Outcome.NotReady;
        Membership.Member storage m = ms.members[who];
        if (!m.active || m.frozen || m.loanTies != 0) {
            DropReason why = !m.active
                ? DropReason.NotAMember
                : (m.frozen ? DropReason.Frozen : DropReason.LoanTies);
            _clear(s, ledger, who, e);
            emit ExitDropped(who, why);
            return Outcome.Dropped;
        }
        uint256 shares = m.shares;
        (uint256 value, uint256 fee,, uint256 payout) = _quote(ledger, r, shares, e.feeBps);
        uint256 available = ledger.cash();
        if (mayPay && payout <= available) {
            _clear(s, ledger, who, e);
            ledger.totalShares -= shares;
            ledger.totalAssets -= payout;
            Membership.removeMember(ms, who);
            emit ExitPaid(who, shares, value, fee, payout);
            _send(ledger, who, payout);
            return Outcome.Paid;
        }
        if (!e.waiting) {
            e.waiting = true;
            ledger.exitsWaiting += 1;
            emit ExitWaiting(who, payout, available);
        }
        return Outcome.Waiting;
    }

    /// @dev Value of `shares` at NAV now, the fee (the lower of `lockedBps` and today's rule) and
    ///      the payout. The last shareholder takes everything with no fee, so nothing is left
    ///      in a circle nobody owns (S-EXIT-09).
    function _quote(
        Ledger.Store storage ledger,
        Rules.Params storage r,
        uint256 shares,
        uint16 lockedBps
    ) private view returns (uint256 value, uint256 fee, uint256 feeBps, uint256 payout) {
        uint256 total = ledger.totalShares;
        if (shares == total) return (ledger.totalAssets, 0, 0, ledger.totalAssets);
        value = SharesMath.assetsForShares(shares, ledger.totalAssets, total);
        feeBps = lockedBps < r.exitFeeBps ? lockedBps : r.exitFeeBps;
        fee = Math.mulDiv(value, feeBps, BPS, Math.Rounding.Ceil); // fees round for the circle
        payout = value - fee;
    }

    function _clear(Store storage s, Ledger.Store storage ledger, address who, Entry storage e)
        private
    {
        if (e.waiting) ledger.exitsWaiting -= 1;
        delete s.entries[who];
    }

    /// @dev Push with a gas cap and no return data (RT-20); if the wallet refuses, keep it for
    ///      `withdraw` exactly as `Ledger.payOut` does.
    function _send(Ledger.Store storage ledger, address to, uint256 amount) private {
        if (amount == 0) return;
        bool ok;
        // `to` is the exiting member. Assembly so no return data is copied (return bombs).
        // solhint-disable no-inline-assembly
        // slither-disable-next-line arbitrary-send-eth,low-level-calls,assembly
        assembly ("memory-safe") {
            ok := call(PAYOUT_GAS, to, amount, 0, 0, 0, 0)
        }
        // solhint-enable no-inline-assembly
        if (!ok) {
            ledger.withdrawable[to] += amount;
            ledger.totalWithdrawable += amount;
            emit Ledger.PayoutQueued(to, amount);
        }
    }
}
