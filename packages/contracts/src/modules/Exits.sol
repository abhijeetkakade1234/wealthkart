// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SharesMath} from "../libraries/SharesMath.sol";
import {PeriodMath} from "../libraries/PeriodMath.sol";
import {Membership} from "./Membership.sol";
import {Ledger} from "./Ledger.sol";
import {Rules} from "./Rules.sol";
import {Governance} from "./Governance.sol";

/// @title Exits
/// @notice Leaving a circle (ADR 0039, 0043): ask to exit, wait out the notice, then get your
///         shares paid in AVAX at the value they have on the day you are paid, minus the exit fee.
///         The fee stays in the circle. Payouts go first come, first served. Anyone can process
///         the queue (Chainlink Automation does it by default), and you can always collect
///         yourself. Also holds the guardian pause (ADR 0020): it stops new loans and joins for
///         at most 14 days, once per 90 days, and never stops an exit, a claim or a repayment.
///         After a dissolve vote (ADR 0021) members take their share of the cash here.
/// @dev External library (ADR 0031, 0037), delegatecalled by the vault with the vault's storage.
///      The only writer of `Ledger.exitsWaiting` and `Ledger.pausedUntil` (Governance also clears
///      the pause when it votes the guardian off).
///
///      Queue (ADR 0043, EXIT-01/02): a doubly linked list of live exits in request order, keyed
///      by member. Request appends at the tail; cancel, payout and drop unlink in O(1), so every
///      scan only ever touches live exits. One live exit per member.
///
///      `Ledger.exitsWaiting` = live exits marked `waiting`: their notice has ended and a payout
///      attempt found too little cash, or found an earlier exit still waiting (first come, first
///      served). The mark is cleared when the exit is paid, cancelled or dropped, so the counter
///      is exact. LoanBook lends nothing while it is above 0 (RT-17).
library Exits {
    using Ledger for Ledger.Store;

    // ------------------------------------------------------------------ types

    /// @dev Two storage slots. `requestedAt` 0 = no exit pending.
    struct Entry {
        /// @dev Exit before this one in the queue (address(0) = first).
        address prev;
        uint64 requestedAt;
        /// @dev Exit fee in force when the member asked. The lower of this and the fee at
        ///      payout applies, so a rule change can't raise the fee on someone already leaving.
        uint16 feeBps;
        /// @dev Counted in `Ledger.exitsWaiting`.
        bool waiting;
        /// @dev Exit after this one in the queue (address(0) = last).
        address next;
        /// @dev When the notice ends and the exit can be paid (UTC seconds).
        uint64 maturesAt;
    }

    struct Store {
        mapping(address member => Entry) entries;
        address first;
        address last;
        /// @dev Start of the guardian's last pause (0 = never).
        uint64 lastPauseAt;
        /// @dev Live exits in the queue.
        uint32 length;
        /// @dev The wallet each member named to claim their share if they go dormant (ADR 0016,
        ///      0056). 0 = none. Cleared when the member leaves.
        mapping(address member => address) nominee;
        /// @dev Open claim vote about the member (a `Membership.Kind.Claim` request id), 0 = none.
        mapping(address member => uint256) claimId;
        /// @dev Set while the member's queued exit is a passed nominee claim: the payout goes to
        ///      this address, fixed when the claim was asked for. Cleared with the queue entry.
        mapping(address member => address) payTo;
    }

    /// @dev How a dormant member comes back (`wake`).
    enum WakeMode {
        /// @dev `wake()`: dues restart like a new member's.
        Wake,
        /// @dev Paying an installment: the payment covers the current period (RT-11).
        Pay,
        /// @dev `cancelNomineeClaim()`: as `Wake`, and there must be a claim to end.
        CancelClaim
    }

    enum DropReason {
        /// @dev No longer a member.
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
    /// @dev Exits one Chainlink upkeep looks at.
    uint256 internal constant UPKEEP_BATCH = 20;
    /// @dev Gas `_settle` may spend before the payout's own floor check: reading the entry and
    ///      member, unlinking, burning shares, removing the member (a fresh `nameFreeAt` write)
    ///      and, for the creator, retiring the guardian. Measured (forge --isolate, all slots
    ///      cold, 24-byte name, creator first): about 121k, 62k for later exits in the batch;
    ///      the S-USDT-09 sweep fails below 125k. 140k leaves room for a waiting flag. A batch
    ///      stops before an exit when less than `Ledger.payoutGasFloor` plus this is left, so a
    ///      payout never hits `PayoutGasTooLow` half way (RT-USDT-01, ADR 0050).
    uint256 internal constant SETTLE_GAS = 140_000;
    /// @dev Shortest notice on a passed nominee claim, whatever the circle's exit notice: the
    ///      member's window to cancel a claim made while they are alive (ADR 0056).
    uint256 internal constant MIN_CLAIM_NOTICE = 30 days;
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
    /// @notice The creator left the circle, so the guardian role ended for good (EXIT-11).
    event GuardianRetired(address indexed guardian);
    /// @notice A dissolution claim: `shares` burned for `amount` of cash. The member stays (and
    ///         can claim again) while shares are left, which happens while loans are still out.
    event DissolutionClaimed(address indexed member, uint256 shares, uint256 amount);
    /// @notice `member` named `nominee` as their backup wallet (address(0) = cleared).
    event NomineeSet(address indexed member, address indexed nominee);
    /// @notice `nominee` asked for dormant `member`'s share; request `requestId` is now voted.
    event NomineeClaimRequested(
        uint256 indexed requestId,
        address indexed member,
        address indexed nominee,
        uint256 deadline,
        uint256 eligible
    );
    /// @notice The circle agreed: `member`'s exit is queued, paid to `nominee` at `maturesAt`.
    event NomineeClaimApproved(
        address indexed member, address indexed nominee, uint256 maturesAt, uint256 feeBps
    );
    /// @notice The claim ended before payout because the member acted from their own wallet.
    event NomineeClaimCancelled(address indexed member, address indexed nominee);
    /// @notice `member`'s exit was paid to `nominee` (also see `ExitPaid`).
    event NomineePaid(address indexed member, address indexed nominee, uint256 payout);

    // ------------------------------------------------------------------ errors

    error ExitAlreadyPending(uint256 maturesAt);
    error NoExitPending();
    error ExitNotReady(uint256 maturesAt);
    error ExitGasTooLow();
    error MemberFrozen(address member);
    error HasLoanTies(address member, uint256 ties);
    error NotGuardian();
    error GuardianOff();
    error PauseTooSoon(uint256 allowedAt);
    error NotPaused();
    /// @notice The guardian paused new loans and joins until `until` (ADR 0020).
    error CirclePaused(uint256 until);
    error NotDissolved();
    /// @notice Your loan or the loan you guarantee must be repaid or settled first.
    error ClaimBlockedByLoan(address member);
    /// @notice All the circle's cash is paid out for now; claim again when loans are repaid.
    error NothingToClaimYet();
    /// @notice A nominee can't be your own wallet or the circle itself.
    error InvalidNominee(address nominee);
    /// @notice Only the wallet `member` named as nominee can ask for their share.
    error NotNominee(address member);
    /// @notice A nominee claim about `member` is open or approved. The member ends it with
    ///         `cancelNomineeClaim` (or by paying, `wake` or changing the nominee).
    error NomineeClaimPending(address member);
    /// @notice There is no nominee claim about you to cancel.
    error NoNomineeClaim(address member);

    // ------------------------------------------------------------------ member actions

    /// @notice Ask to leave. Notice = `exitNoticeDays`. While a rule change waits (ADR 0019,
    ///         0043), the exit matures at the earlier of that and the moment the new rules
    ///         apply, under the old rules: never instantly, never later than the switch.
    ///         Dormant members may exit: their shares are theirs. Closed once dissolved. A nominee
    ///         claim about you ends first: you asked to be paid yourself (ADR 0056).
    function requestExit(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r
    ) external {
        if (ledger.dissolved) revert Governance.CircleDissolved();
        Membership.Member storage m = ms.members[msg.sender];
        if (!m.active) revert Membership.NotAMember(msg.sender);
        if (m.frozen) revert MemberFrozen(msg.sender);
        if (m.loanTies != 0) revert HasLoanTies(msg.sender, m.loanTies);
        _cancelClaim(s, ledger, ms, msg.sender);
        Entry storage e = s.entries[msg.sender];
        if (e.requestedAt != 0) revert ExitAlreadyPending(e.maturesAt);
        uint64 nowTs = SafeCast.toUint64(block.timestamp);
        uint64 maturesAt = nowTs + uint64(r.exitNoticeDays) * 1 days;
        uint64 rageQuitEnd = ledger.rageQuitUntil;
        if (nowTs < rageQuitEnd && rageQuitEnd < maturesAt) maturesAt = rageQuitEnd;
        _enqueue(s, ms, r, msg.sender, maturesAt);
        emit ExitRequested(msg.sender, maturesAt, r.exitFeeBps);
    }

    /// @notice Stay after all. Works any time before the payout. Your vote comes back for
    ///         proposals opened from now on. A queued nominee claim is ended with
    ///         `cancelNomineeClaim` instead, which also brings you back from dormant.
    function cancelExit(Store storage s, Ledger.Store storage ledger, Membership.Store storage ms)
        external
    {
        if (s.entries[msg.sender].requestedAt == 0) revert NoExitPending();
        if (s.payTo[msg.sender] != address(0)) revert NomineeClaimPending(msg.sender);
        _drop(s, ledger, ms, msg.sender);
        emit ExitCancelled(msg.sender);
    }

    // ------------------------------------------------------------------ nominee (ADR 0016, 0056)

    /// @notice Name the wallet that may claim your share if you go dormant, or clear it with
    ///         address(0). Anyone but you and the circle itself: a member or an outsider. If a
    ///         claim about you is open or approved, it ends and you come back from dormant: the
    ///         change proves you hold your wallet, and an approved payout is never redirected.
    function setNominee(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        uint8 dueDay,
        address nominee
    ) external {
        if (!ms.members[msg.sender].active) {
            revert Membership.NotAMember(msg.sender);
        }
        if (nominee == msg.sender || nominee == address(this)) revert InvalidNominee(nominee);
        if (_cancelClaim(s, ledger, ms, msg.sender)) {
            Membership.wakeMember(ms, msg.sender, Membership.firstDuePeriod(dueDay));
        }
        s.nominee[msg.sender] = nominee;
        emit NomineeSet(msg.sender, nominee);
    }

    /// @notice The nominee asks for dormant `member`'s share. Opens a vote with the usual window
    ///         and quorum; it passes with 66% of votes cast. Neither the member nor the nominee
    ///         can vote on it. Refused while the member has a loan tie, is frozen, has an exit
    ///         pending, or once the circle is dissolved. One open claim per member.
    /// @return id The request id (a `Membership.Kind.Claim` request).
    function requestClaim(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Membership.Params calldata p,
        address member
    ) external returns (uint256 id) {
        if (ledger.dissolved) revert Governance.CircleDissolved();
        address nom = s.nominee[member];
        if (nom == address(0) || nom != msg.sender) revert NotNominee(member);
        Membership.Member storage m = ms.members[member];
        if (!m.active) revert Membership.NotAMember(member);
        if (!m.dormant) revert Membership.NotDormant(member);
        if (m.frozen) revert MemberFrozen(member);
        if (m.loanTies != 0) revert HasLoanTies(member, m.loanTies);
        if (s.claimId[member] != 0 || s.payTo[member] != address(0)) {
            revert NomineeClaimPending(member);
        }
        Entry storage e = s.entries[member];
        if (e.requestedAt != 0) revert ExitAlreadyPending(e.maturesAt);

        // Everyone who can vote now, minus the nominee if they are one of them. The member is
        // dormant, so not counted. `openRequest` refuses 0 (NoOtherVoters).
        uint256 voters = ms.voterCount - (Membership.inVoterCount(ms, nom) ? 1 : 0);
        id = Membership.openRequest(
            ms, p, Membership.Kind.Claim, member, nom, SafeCast.toUint32(voters)
        );
        s.claimId[member] = id;
        emit NomineeClaimRequested(id, member, nom, ms.requests[id - 1].deadline, voters);
    }

    /// @notice Acts on a closed claim vote (the vault calls it after `vote` or `finalize`). On a
    ///         pass the member's exit is queued like `requestExit` (same fee and payout), paid to
    ///         the nominee who asked. Notice: the circle's exit notice, at least 30 days, with no
    ///         rage-quit cap, so a member who is alive always has time to cancel.
    function closeClaim(
        Store storage s,
        Membership.Store storage ms,
        Rules.Params storage r,
        uint256 id
    ) external {
        Membership.Request storage q = ms.requests[id - 1];
        address member = q.account;
        delete s.claimId[member];
        if (q.status != Membership.Status.Approved) return;
        // Guard only: asking to exit ends a claim first, so no entry can exist here.
        if (s.entries[member].requestedAt != 0) {
            emit NomineeClaimCancelled(member, q.invitedBy);
            return;
        }
        // The member's last chance to cancel: the circle's exit notice, at least
        // MIN_CLAIM_NOTICE, and never shortened by a rage-quit window (ADR 0056).
        uint256 notice = uint256(r.exitNoticeDays) * 1 days;
        if (notice < MIN_CLAIM_NOTICE) notice = MIN_CLAIM_NOTICE;
        uint64 maturesAt = SafeCast.toUint64(block.timestamp + notice);
        _enqueue(s, ms, r, member, maturesAt);
        s.payTo[member] = q.invitedBy;
        emit NomineeClaimApproved(member, q.invitedBy, maturesAt, r.exitFeeBps);
    }

    /// @notice Every way back from dormant (`wake`, paying, `cancelNomineeClaim`). A nominee
    ///         claim about the caller ends first, open or approved; then the member wakes.
    function wake(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        uint8 dueDay,
        WakeMode mode
    ) external {
        bool ended = _cancelClaim(s, ledger, ms, msg.sender);
        if (mode == WakeMode.CancelClaim && !ended) revert NoNomineeClaim(msg.sender);
        uint32 next = mode == WakeMode.Pay
            ? SafeCast.toUint32(PeriodMath.periodOf(block.timestamp))
            : Membership.firstDuePeriod(dueDay);
        Membership.wakeMember(ms, msg.sender, next);
    }

    /// @notice Collect your own exit once the notice has ended (RT-21: no keeper needed). Settles
    ///         the queue in order up to you, so an earlier exit whose notice has ended is paid (or
    ///         marked waiting) first; you are paid unless an exit ahead of you is waiting for
    ///         cash, and then you keep your place.
    /// @return paid True if the payout was made (or kept for `withdraw`, if your wallet refused).
    function claimExit(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r
    ) external returns (bool paid) {
        Entry storage e = s.entries[msg.sender];
        if (e.requestedAt == 0) revert NoExitPending();
        // A passed nominee claim is paid to the nominee: the member ends it, never collects it.
        if (s.payTo[msg.sender] != address(0)) revert NomineeClaimPending(msg.sender);
        if (block.timestamp < e.maturesAt) revert ExitNotReady(e.maturesAt);
        (, paid) = _walk(s, ledger, ms, r, type(uint256).max, msg.sender);
    }

    /// @notice Settle up to `maxCount` exits from the front, first come, first served. Anyone
    ///         can call it. Once an exit can't be paid, the ones behind it wait too.
    /// @return paid Exits paid in this call.
    function processExits(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r,
        uint256 maxCount
    ) external returns (uint256 paid) {
        (paid,) = _walk(s, ledger, ms, r, maxCount, address(0));
    }

    /// @notice After a dissolve vote (ADR 0021, 0043): take your share of the circle's cash now,
    ///         `shares x cash / totalShares`, rounded down. While loans are out, the matching part
    ///         of your shares is burned and you stay, so you can claim again as loans are repaid
    ///         or settled. Once no loans are out, you take the rest and leave; the last one out
    ///         empties the vault. A waiting exit of yours is cleared first. Not while your own
    ///         loan or a loan you guarantee is still open.
    /// @dev O(1). Burns `ceil(amount x totalShares / totalAssets)` shares, which never lowers NAV
    ///      for the members still in. CEI: books first, the payout last (RT-20).
    function claimDissolution(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms
    ) external {
        if (!ledger.dissolved) revert NotDissolved();
        Membership.Member storage m = ms.members[msg.sender];
        if (!m.active) revert Membership.NotAMember(msg.sender);
        if (m.frozen || m.loanTies != 0) revert ClaimBlockedByLoan(msg.sender);
        // The member is claiming in person, so a nominee claim about them ends (ADR 0056).
        _cancelClaim(s, ledger, ms, msg.sender);
        if (s.entries[msg.sender].requestedAt != 0) _drop(s, ledger, ms, msg.sender);

        uint256 shares = m.shares;
        uint256 ta = ledger.totalAssets;
        uint256 ts = ledger.totalShares;
        uint256 out = ledger.loansOutstanding;
        uint256 amount = 0;
        uint256 burn = shares;
        if (shares != 0) {
            if (out == 0) {
                amount = shares == ts ? ta : Math.mulDiv(shares, ta, ts);
            } else {
                amount = Math.mulDiv(shares, ta - out, ts);
                burn = Math.mulDiv(amount, ts, ta, Math.Rounding.Ceil);
                if (burn == 0) revert NothingToClaimYet();
            }
        }
        ledger.totalShares = ts - burn;
        ledger.totalAssets = ta - amount;
        if (burn == shares) _remove(s, ms, ledger, msg.sender);
        else m.shares = SafeCast.toUint128(shares - burn);
        emit DissolutionClaimed(msg.sender, burn, amount);
        ledger.payOut(msg.sender, amount);
    }

    // ------------------------------------------------------------------ guardian (ADR 0020)

    /// @notice Pause new loans and joins for 14 days. Only the guardian (the circle's creator,
    ///         while still a member), only if the role hasn't ended (voted off, or the creator
    ///         left once), and at most once per 90 days (RT-14). Exits, claims and repayments
    ///         keep working.
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
        uint64 lastAt = s.lastPauseAt;
        if (lastAt != 0 && nowTs < lastAt + PAUSE_COOLDOWN) {
            revert PauseTooSoon(lastAt + PAUSE_COOLDOWN);
        }
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

    /// @notice Chainlink Automation: true if `processExits` would pay, mark or drop one of the
    ///         first `UPKEEP_BATCH` exits. Mirrors `processExits` without writing.
    function upkeepNeeded(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r
    ) external view returns (bool) {
        uint256 cash = ledger.cash();
        bool blocked = false;
        address who = s.first;
        for (uint256 n = 0; n < UPKEEP_BATCH && who != address(0); ++n) {
            Entry storage e = s.entries[who];
            if (block.timestamp >= e.maturesAt) {
                Membership.Member storage m = ms.members[who];
                if (!m.active || m.frozen || m.loanTies != 0) return true;
                if (!blocked) {
                    (,,, uint256 payout) = _quote(ledger, r, m.shares, e.feeBps);
                    if (payout <= cash) return true;
                    blocked = true;
                }
                if (!e.waiting) return true;
            }
            who = e.next;
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
        uint16 feeBps = e.requestedAt != 0 ? e.feeBps : r.exitFeeBps;
        (,,, payout) = _quote(ledger, r, m.shares, feeBps);
    }

    /// @notice `member`'s pending exit (`requestedAt` 0 = none).
    function entryOf(Store storage s, address member) external view returns (Entry memory) {
        return s.entries[member];
    }

    /// @notice Exits in queue order from position `offset`, at most `limit` of them. Read each
    ///         with the vault's `exitOf`.
    function queuePage(Store storage s, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory who)
    {
        uint256 len = s.length;
        if (offset >= len) return who;
        uint256 n = len - offset < limit ? len - offset : limit;
        who = new address[](n);
        address a = s.first;
        for (uint256 i = 0; i < offset; ++i) {
            a = s.entries[a].next;
        }
        for (uint256 i = 0; i < n; ++i) {
            who[i] = a;
            a = s.entries[a].next;
        }
    }

    // ------------------------------------------------------------------ internals

    enum Outcome {
        NotReady,
        Paid,
        Dropped,
        Waiting
    }

    /// @dev Settles live exits from the front, at most `maxCount`, stopping after `target` when
    ///      it is set. Once one waits for cash, the ones behind it may not be paid (FIFO).
    function _walk(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        Rules.Params storage r,
        uint256 maxCount,
        address target
    ) private returns (uint256 paid, bool targetPaid) {
        bool blocked = false;
        address who = s.first;
        // AVAX 230k, USDT 280k: the payout floor for this circle's money plus settle overhead.
        uint256 minGas = ledger.payoutGasFloor() + SETTLE_GAS;
        for (uint256 n = 0; n < maxCount && who != address(0); ++n) {
            if (gasleft() < minGas) {
                // A claim must reach the claimant, and a batch must make progress; otherwise
                // revert so a wallet's gas estimate finds a limit that works instead of a run
                // that succeeds while paying nobody. A batch that already settled some stops.
                if (target != address(0) || n == 0) revert ExitGasTooLow();
                break;
            }
            address nextWho = s.entries[who].next;
            Outcome outcome = _settle(s, ledger, ms, r, who, !blocked);
            if (outcome == Outcome.Paid) {
                ++paid;
                if (who == target) targetPaid = true;
            } else if (outcome == Outcome.Waiting) {
                blocked = true;
            }
            if (who == target) break;
            who = nextWho;
        }
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
            _drop(s, ledger, ms, who);
            emit ExitDropped(who, why);
            return Outcome.Dropped;
        }
        uint256 shares = m.shares;
        (uint256 value, uint256 fee,, uint256 payout) = _quote(ledger, r, shares, e.feeBps);
        uint256 available = ledger.cash();
        if (mayPay && payout <= available) {
            emit ExitPaid(who, shares, value, fee, payout);
            _pay(s, ledger, ms, who, shares, payout);
            return Outcome.Paid;
        }
        if (!e.waiting) {
            e.waiting = true;
            ledger.exitsWaiting += 1;
            emit ExitWaiting(who, payout, available);
        }
        return Outcome.Waiting;
    }

    /// @dev Books a paid exit, then sends it: to the member, or for a passed nominee claim to
    ///      the nominee fixed when it was asked for (ADR 0056). The transfer is the last step.
    function _pay(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        address who,
        uint256 shares,
        uint256 payout
    ) private {
        address to = s.payTo[who];
        if (to == address(0)) to = who;
        else emit NomineePaid(who, to, payout);
        _unlink(s, ledger, who);
        ledger.totalShares -= shares;
        ledger.totalAssets -= payout;
        _remove(s, ms, ledger, who);
        ledger.payOut(to, payout);
    }

    /// @dev Value of `shares` at NAV now, the fee (the lower of `lockedBps` and today's rule; none
    ///      once dissolved, GOV-02) and the payout. The last shareholder takes everything with no
    ///      fee, so nothing is left in a circle nobody owns (S-EXIT-09); a member with no shares
    ///      never counts as the last one (EXIT-08).
    function _quote(
        Ledger.Store storage ledger,
        Rules.Params storage r,
        uint256 shares,
        uint16 lockedBps
    ) private view returns (uint256 value, uint256 fee, uint256 feeBps, uint256 payout) {
        uint256 total = ledger.totalShares;
        if (shares != 0 && shares == total) {
            return (ledger.totalAssets, 0, 0, ledger.totalAssets);
        }
        value = SharesMath.assetsForShares(shares, ledger.totalAssets, total);
        if (!ledger.dissolved) feeBps = lockedBps < r.exitFeeBps ? lockedBps : r.exitFeeBps;
        fee = Math.mulDiv(value, feeBps, BPS, Math.Rounding.Ceil); // fees round for the circle
        payout = value - fee;
    }

    /// @dev Takes `who`'s exit off the queue without paying it; the member stays and votes again.
    function _drop(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        address who
    ) private {
        _unlink(s, ledger, who);
        if (ms.members[who].active) Membership.setExiting(ms, who, false);
    }

    /// @dev Appends `who` to the queue, maturing at `maturesAt`, with the exit fee in force, and
    ///      flags them leaving. Shared by `requestExit` and passed nominee claims.
    function _enqueue(
        Store storage s,
        Membership.Store storage ms,
        Rules.Params storage r,
        address who,
        uint64 maturesAt
    ) private {
        Entry storage e = s.entries[who];
        address tail = s.last;
        e.prev = tail;
        e.requestedAt = SafeCast.toUint64(block.timestamp);
        e.feeBps = r.exitFeeBps;
        e.maturesAt = maturesAt;
        if (tail == address(0)) s.first = who;
        else s.entries[tail].next = who;
        s.last = who;
        s.length += 1;
        Membership.setExiting(ms, who, true);
    }

    /// @dev Ends a nominee claim about `who`, open (vote running) or approved (queued), without
    ///      waking them. Returns false if there was none.
    function _cancelClaim(
        Store storage s,
        Ledger.Store storage ledger,
        Membership.Store storage ms,
        address who
    ) private returns (bool) {
        uint256 id = s.claimId[who];
        address nom;
        if (id != 0) {
            delete s.claimId[who];
            nom = ms.requests[id - 1].invitedBy;
            Membership.cancelRequest(ms, id);
        } else {
            nom = s.payTo[who];
            if (nom == address(0)) return false;
            _drop(s, ledger, ms, who);
        }
        emit NomineeClaimCancelled(who, nom);
        return true;
    }

    /// @dev O(1) unlink; keeps `exitsWaiting` exact. Clears a nominee payee with the entry.
    function _unlink(Store storage s, Ledger.Store storage ledger, address who) private {
        Entry storage e = s.entries[who];
        if (e.waiting) ledger.exitsWaiting -= 1;
        address p = e.prev;
        address n = e.next;
        if (p == address(0)) s.first = n;
        else s.entries[p].next = n;
        if (n == address(0)) s.last = p;
        else s.entries[n].prev = p;
        s.length -= 1;
        delete s.entries[who];
        delete s.payTo[who];
    }

    /// @dev Removes a member who is paid out, and their nominee with them. When the creator
    ///      leaves, the guardian role ends for good and any pause with it, even if they rejoin
    ///      later (EXIT-11).
    function _remove(
        Store storage s,
        Membership.Store storage ms,
        Ledger.Store storage ledger,
        address who
    ) private {
        Membership.removeMember(ms, who);
        delete s.nominee[who];
        // memberList[0] is the creator (Membership.init adds them first).
        if (who == ms.memberList[0] && !ledger.guardianDisabled) {
            ledger.guardianDisabled = true;
            ledger.pausedUntil = 0;
            emit GuardianRetired(who);
        }
    }
}
