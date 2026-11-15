// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {PeriodMath} from "../libraries/PeriodMath.sol";
import {SharesMath} from "../libraries/SharesMath.sol";
import {Membership} from "./Membership.sol";
import {Ledger} from "./Ledger.sol";
import {Rules} from "./Rules.sol";

/// @title Governance
/// @notice Circle-wide decisions taken by member vote (ADR 0040): rule changes that wait out a
///         delay while members may leave under the old rules (ADR 0019), late-fee waivers with a
///         fixed reason (PLAN.md D4b), dissolving the circle (ADR 0021) and voting the guardian
///         off (ADR 0020).
/// @dev External library (ADR 0037): linked into CircleVault and delegatecalled, so every write
///      lands in the vault's storage. The only module that writes `Ledger.rageQuitUntil`,
///      `Ledger.dissolved` and `Ledger.guardianDisabled`; it also clears `Ledger.pausedUntil` when
///      the guardian is voted off (the one write to it outside Exits). Every write is O(1)
///      (ADR 0015). All times are UTC (ADR 0014).
library Governance {
    using Membership for Membership.Store;
    using Ledger for Ledger.Store;

    // ------------------------------------------------------------------ types

    enum Kind {
        /// @dev Replace the circle's rules after the delay.
        RuleChange,
        /// @dev Waive the late fees on one member's installment for one period.
        FeeWaiver,
        /// @dev Wind the circle down; members claim their share once no loans are out.
        Dissolve,
        /// @dev Remove the guardian's pause power for good.
        GuardianOff
    }

    enum Status {
        None,
        Open,
        Approved,
        Rejected,
        /// @dev Voting window ended without quorum.
        Expired,
        /// @dev Withdrawn by the proposer.
        Cancelled
    }

    /// @dev Why a fee waiver is asked for. A fixed list, never free text, so nothing personal
    ///      goes on-chain (PLAN.md D5).
    enum Reason {
        Medical,
        Bereavement,
        BankIssue,
        Other
    }

    struct Proposal {
        Kind kind;
        Status status;
        /// @dev Fee waiver only.
        Reason reason;
        /// @dev Pass mark copied from the rules when the proposal opened, in percent.
        uint8 passPct;
        uint32 seqSnapshot;
        /// @dev Voters possible at proposal time (minus a waiver's subject): quorum base.
        uint32 eligible;
        uint32 yes;
        uint32 no;
        address proposer;
        uint64 deadline;
        /// @dev Fee waiver: the member whose fees are waived and the period.
        address subject;
        uint32 period;
    }

    struct Store {
        /// @dev Proposal id `n` lives at index `n - 1`; id 0 means "none".
        Proposal[] proposals;
        /// @dev Rules asked for by a rule-change proposal.
        mapping(uint256 id => Rules.Params) proposedRules;
        mapping(uint256 id => mapping(address voter => bool)) hasVoted;
        /// @dev Open proposal ids, swap-and-pop; `openPos` is index + 1.
        uint256[] openIds;
        mapping(uint256 id => uint256) openPos;
        mapping(address proposer => uint256) openBy;
        /// @dev The open rule-change proposal, or 0. Only one at a time.
        uint256 openRuleChange;
        /// @dev A passed rule change waiting for `effectiveAt` (0 = none).
        Rules.Params pendingRules;
        uint64 effectiveAt;
    }

    /// @dev The vault's immutable settings this module needs.
    struct Params {
        uint128 installment;
        uint32 votingWindow;
        uint8 quorumPct;
    }

    // ------------------------------------------------------------------ constants

    /// @dev Open proposals allowed at once and per proposer (RT-05).
    uint256 internal constant MAX_OPEN_PROPOSALS = 10;
    uint256 internal constant MAX_OPEN_PROPOSALS_PER_MEMBER = 2;
    uint256 private constant PERCENT = 100;

    // ------------------------------------------------------------------ events

    event ProposalCreated(
        uint256 indexed id,
        Kind kind,
        address indexed proposer,
        address indexed subject,
        uint256 period,
        Reason reason,
        uint256 deadline,
        uint256 eligible
    );
    event ProposalVoted(uint256 indexed id, address indexed voter, bool support);
    event ProposalClosed(uint256 indexed id, Kind kind, Status status);
    /// @notice A rule change passed; it applies at `effectiveAt`, and until then members may
    ///         exit with no notice under the current rules.
    event RuleChangeScheduled(uint256 indexed id, uint256 effectiveAt);
    event RuleChangeApplied(uint256 effectiveAt);
    event FeeWaived(address indexed member, uint256 indexed period, Reason reason);
    event CircleDissolving(uint256 indexed id);
    event GuardianDisabled(uint256 indexed id);
    event DissolutionClaimed(address indexed member, uint256 shares, uint256 amount);

    // ------------------------------------------------------------------ errors

    error NotAllowedToPropose(address account);
    error TooManyOpenProposals();
    error TooManyOpenProposalsBy(address proposer);
    error NoEligibleVoters();
    error RuleChangeInProgress();
    error NoPendingRuleChange();
    error RuleChangeNotDue(uint256 effectiveAt);
    error InvalidWaiver(address member, uint256 period);
    error GuardianAlreadyOff();
    error ProposalNotOpen(uint256 id);
    error ProposalVotingClosed(uint256 id);
    error CannotVoteOnProposal(uint256 id, address voter);
    error AlreadyVotedOnProposal(uint256 id);
    error ProposalNotDecided(uint256 id);
    error NotProposer(uint256 id);
    error CircleDissolved();
    error NotDissolved();
    error LoansStillOutstanding(uint256 amount);

    // ------------------------------------------------------------------ proposals

    /// @notice Propose new rules. They must be inside the bounds now (`Rules.validate`). Your
    ///         yes vote is counted. One rule change may be open or waiting at a time.
    function proposeRuleChange(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Rules.Params storage current,
        Params calldata p,
        Rules.Params calldata newRules
    ) external returns (uint256 id) {
        Rules.validate(newRules, p.installment);
        if (g.openRuleChange != 0) revert RuleChangeInProgress();
        if (g.effectiveAt != 0) {
            // A change that is due is applied first; one still waiting blocks a new proposal.
            if (block.timestamp < g.effectiveAt) revert RuleChangeInProgress();
            _apply(g, current, p.installment);
        }
        id = _proposeAsVoter(g, m, ledger, p, Kind.RuleChange, current.passPct);
        g.proposedRules[id] = newRules;
        g.openRuleChange = id;
        _castVote(g, m, ledger, current, p, id, true);
    }

    /// @notice Ask the circle to waive the late fees on `member`'s installment for `period`.
    ///         The member may ask for themselves; they can't vote on it. Another member's yes
    ///         vote is counted when they propose it.
    function proposeFeeWaiver(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Rules.Params storage current,
        Params calldata p,
        address member,
        uint256 period,
        Reason reason
    ) external returns (uint256 id) {
        id = _open(
            g, m, ledger, p, Kind.FeeWaiver, current.passPct, _waiverVoters(m, member, period)
        );
        Proposal storage pr = g.proposals[id - 1];
        pr.subject = member;
        pr.period = SafeCast.toUint32(period);
        pr.reason = reason;
        _emitCreated(id, pr);
        if (msg.sender != member) _castVote(g, m, ledger, current, p, id, true);
    }

    /// @notice Propose dissolving the circle (ADR 0021), at the dissolve pass mark. Your yes
    ///         vote is counted.
    function proposeDissolve(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Rules.Params storage current,
        Params calldata p
    ) external returns (uint256 id) {
        id = _proposeAsVoter(g, m, ledger, p, Kind.Dissolve, current.dissolvePassPct);
        _castVote(g, m, ledger, current, p, id, true);
    }

    /// @notice Propose removing the guardian's pause power (ADR 0020). Your yes vote is counted.
    function proposeGuardianOff(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Rules.Params storage current,
        Params calldata p
    ) external returns (uint256 id) {
        if (ledger.guardianDisabled) revert GuardianAlreadyOff();
        id = _proposeAsVoter(g, m, ledger, p, Kind.GuardianOff, current.passPct);
        _castVote(g, m, ledger, current, p, id, true);
    }

    /// @notice Vote on an open proposal. Only members who could vote when it opened and still
    ///         can now vote; a waiver's subject can't. The vote that decides it settles it.
    function vote(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Rules.Params storage current,
        Params calldata p,
        uint256 id,
        bool support
    ) external {
        Proposal storage pr = _openProposal(g, id);
        if (block.timestamp > pr.deadline) revert ProposalVotingClosed(id);
        if (!_canVoteOn(m, pr, msg.sender)) revert CannotVoteOnProposal(id, msg.sender);
        if (g.hasVoted[id][msg.sender]) revert AlreadyVotedOnProposal(id);
        _castVote(g, m, ledger, current, p, id, support);
    }

    /// @notice Settle a proposal once the outcome is certain or the window has ended. Anyone.
    function finalize(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Rules.Params storage current,
        Params calldata p,
        uint256 id
    ) external {
        Proposal storage pr = _openProposal(g, id);
        Status outcome = _outcome(pr, p.quorumPct, block.timestamp > pr.deadline);
        if (outcome == Status.Open) revert ProposalNotDecided(id);
        _close(g, m, ledger, current, id, pr, outcome);
    }

    /// @notice The proposer withdraws an open proposal.
    function cancel(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Rules.Params storage current,
        Params calldata,
        uint256 id
    ) external {
        Proposal storage pr = _openProposal(g, id);
        if (msg.sender != pr.proposer) revert NotProposer(id);
        _close(g, m, ledger, current, id, pr, Status.Cancelled);
    }

    /// @notice Put a passed rule change into force once its time has come. Anyone can call it.
    function applyRuleChange(
        Store storage g,
        Membership.Store storage,
        Ledger.Store storage,
        Rules.Params storage current,
        Params calldata p
    ) external {
        uint64 at = g.effectiveAt;
        // slither-disable-next-line incorrect-equality (0 is the "nothing pending" sentinel)
        if (at == 0) revert NoPendingRuleChange();
        if (block.timestamp < at) revert RuleChangeNotDue(at);
        _apply(g, current, p.installment);
    }

    // ------------------------------------------------------------------ dissolution

    /// @notice After a dissolve vote, and once every loan is repaid, a member takes their share
    ///         of the circle at NAV and leaves. The last one out empties the vault.
    /// @dev CEI: shares and assets are reduced and the member removed before the payout, which
    ///      is the last step and queues the AVAX if the wallet refuses it (RT-20).
    function claimDissolution(
        Store storage,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Rules.Params storage,
        Params calldata
    ) external {
        if (!ledger.dissolved) revert NotDissolved();
        if (ledger.loansOutstanding != 0) revert LoansStillOutstanding(ledger.loansOutstanding);
        uint256 shares = m.members[msg.sender].shares;
        // The last holder gets everything left, so no dust stays behind.
        uint256 amount = shares == ledger.totalShares
            ? ledger.totalAssets
            : SharesMath.assetsForShares(shares, ledger.totalAssets, ledger.totalShares);
        ledger.totalShares -= shares;
        ledger.totalAssets -= amount;
        m.removeMember(msg.sender);
        emit DissolutionClaimed(msg.sender, shares, amount);
        ledger.payOut(msg.sender, amount);
    }

    // ------------------------------------------------------------------ views
    // Same leading parameters as the writes, so the vault forwards every call the same way.

    function proposal(
        Store storage g,
        Membership.Store storage,
        Ledger.Store storage,
        Rules.Params storage,
        Params calldata,
        uint256 id
    ) external view returns (Proposal memory) {
        return g.proposals[id - 1];
    }

    function proposalRules(
        Store storage g,
        Membership.Store storage,
        Ledger.Store storage,
        Rules.Params storage,
        Params calldata,
        uint256 id
    ) external view returns (Rules.Params memory) {
        return g.proposedRules[id];
    }

    function pendingRuleChange(
        Store storage g,
        Membership.Store storage,
        Ledger.Store storage,
        Rules.Params storage,
        Params calldata
    ) external view returns (Rules.Params memory, uint64) {
        return (g.pendingRules, g.effectiveAt);
    }

    function canVote(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage,
        Rules.Params storage,
        Params calldata,
        uint256 id,
        address voter
    ) external view returns (bool) {
        if (id == 0 || id > g.proposals.length) return false;
        Proposal storage pr = g.proposals[id - 1];
        return pr.status == Status.Open && block.timestamp <= pr.deadline
            && _canVoteOn(m, pr, voter) && !g.hasVoted[id][voter];
    }

    function openPage(
        Store storage g,
        Membership.Store storage,
        Ledger.Store storage,
        Rules.Params storage,
        Params calldata,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory ids, Proposal[] memory page) {
        uint256 len = g.openIds.length;
        if (offset >= len) return (new uint256[](0), new Proposal[](0));
        uint256 end = offset + limit > len ? len : offset + limit;
        ids = new uint256[](end - offset);
        page = new Proposal[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            ids[i - offset] = g.openIds[i];
            page[i - offset] = g.proposals[g.openIds[i] - 1];
        }
    }

    // ------------------------------------------------------------------ internals

    /// @dev Opens a proposal from a current voter; quorum base = voters right now.
    function _proposeAsVoter(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Params calldata p,
        Kind kind,
        uint8 passPct
    ) private returns (uint256 id) {
        if (!m.isCurrentVoter(msg.sender)) revert NotAllowedToPropose(msg.sender);
        id = _open(g, m, ledger, p, kind, passPct, m.voterCount);
        _emitCreated(id, g.proposals[id - 1]);
    }

    /// @dev Checks a waiver request and returns its quorum base: voters now, minus the member
    ///      it is about. Only an unpaid period that has started and isn't waived yet qualifies.
    ///      The member may ask for themselves; anyone else must be a current voter.
    function _waiverVoters(Membership.Store storage m, address member, uint256 period)
        private
        view
        returns (uint256)
    {
        Membership.Member storage s = m.members[member];
        if (
            !s.active || period < s.nextPeriod || period > PeriodMath.periodOf(block.timestamp)
                || m.feeWaived[member][period]
        ) revert InvalidWaiver(member, period);
        if (msg.sender != member && !m.isCurrentVoter(msg.sender)) {
            revert NotAllowedToPropose(msg.sender);
        }
        return m.voterCount - (s.voter && !s.dormant ? 1 : 0);
    }

    function _open(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Params calldata p,
        Kind kind,
        uint8 passPct,
        uint256 eligible
    ) private returns (uint256 id) {
        if (ledger.dissolved) revert CircleDissolved();
        if (eligible == 0) revert NoEligibleVoters();
        if (g.openIds.length >= MAX_OPEN_PROPOSALS) revert TooManyOpenProposals();
        if (g.openBy[msg.sender] >= MAX_OPEN_PROPOSALS_PER_MEMBER) {
            revert TooManyOpenProposalsBy(msg.sender);
        }
        g.openBy[msg.sender] += 1;
        Proposal storage pr = g.proposals.push();
        pr.kind = kind;
        pr.status = Status.Open;
        pr.passPct = passPct;
        pr.seqSnapshot = m.seqCounter;
        pr.eligible = SafeCast.toUint32(eligible);
        pr.proposer = msg.sender;
        pr.deadline = SafeCast.toUint64(block.timestamp) + p.votingWindow;
        id = g.proposals.length;
        g.openIds.push(id);
        g.openPos[id] = g.openIds.length;
    }

    function _emitCreated(uint256 id, Proposal storage pr) private {
        emit ProposalCreated(
            id, pr.kind, pr.proposer, pr.subject, pr.period, pr.reason, pr.deadline, pr.eligible
        );
    }

    /// @dev In the circle with voting rights before the proposal, can vote now, and not the
    ///      member a waiver is about.
    function _canVoteOn(Membership.Store storage m, Proposal storage pr, address voter)
        private
        view
        returns (bool)
    {
        if (pr.kind == Kind.FeeWaiver && voter == pr.subject) return false;
        return m.canVoteAt(voter, pr.seqSnapshot);
    }

    function _castVote(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Rules.Params storage current,
        Params calldata p,
        uint256 id,
        bool support
    ) private {
        Proposal storage pr = g.proposals[id - 1];
        g.hasVoted[id][msg.sender] = true;
        if (support) pr.yes += 1;
        else pr.no += 1;
        emit ProposalVoted(id, msg.sender, support);
        Status outcome = _outcome(pr, p.quorumPct, false);
        if (outcome != Status.Open) _close(g, m, ledger, current, id, pr, outcome);
    }

    /// @dev Open = not decided yet. Passes on quorum (of `eligible`) plus the pass mark of votes
    ///      cast; decided early only when the remaining votes can't change the result.
    ///      `yes + no <= eligible` for the same reason as in Membership: only voters stamped
    ///      before the snapshot who are still voters vote, and each was counted in `eligible`.
    function _outcome(Proposal storage pr, uint8 quorumPct, bool ended)
        private
        view
        returns (Status)
    {
        uint256 e = pr.eligible;
        uint256 yes = pr.yes;
        uint256 no = pr.no;
        uint8 pct = pr.passPct;
        bool quorum = (yes + no) * PERCENT >= uint256(quorumPct) * e;
        if (quorum && Rules.passes(yes, e, pct)) return Status.Approved;
        if (!Rules.passes(e - no, e, pct)) return Status.Rejected;
        if (!ended) return Status.Open;
        if (!quorum) return Status.Expired;
        return Rules.passes(yes, yes + no, pct) ? Status.Approved : Status.Rejected;
    }

    /// @dev Effects only; no external calls.
    function _close(
        Store storage g,
        Membership.Store storage m,
        Ledger.Store storage ledger,
        Rules.Params storage current,
        uint256 id,
        Proposal storage pr,
        Status outcome
    ) private {
        Kind kind = pr.kind;
        pr.status = outcome;
        g.openBy[pr.proposer] -= 1;
        uint256 pos = g.openPos[id];
        uint256 lastId = g.openIds[g.openIds.length - 1];
        g.openIds[pos - 1] = lastId;
        g.openPos[lastId] = pos;
        g.openIds.pop();
        delete g.openPos[id];
        if (kind == Kind.RuleChange) g.openRuleChange = 0;
        emit ProposalClosed(id, kind, outcome);

        if (outcome != Status.Approved) return;
        if (kind == Kind.RuleChange) {
            uint64 at = _effectiveAt(current.ruleChangeDelayDays);
            g.pendingRules = g.proposedRules[id];
            g.effectiveAt = at;
            ledger.rageQuitUntil = at;
            emit RuleChangeScheduled(id, at);
        } else if (kind == Kind.FeeWaiver) {
            m.feeWaived[pr.subject][pr.period] = true;
            emit FeeWaived(pr.subject, pr.period, pr.reason);
        } else if (kind == Kind.Dissolve) {
            ledger.dissolved = true;
            emit CircleDissolving(id);
        } else {
            ledger.guardianDisabled = true;
            ledger.pausedUntil = 0;
            emit GuardianDisabled(id);
        }
    }

    /// @dev ADR 0019: the delay runs first, then the change waits for the next period to start,
    ///      so it never applies to a period already under way (RT-24). A delay that ends exactly
    ///      at a period start applies then.
    function _effectiveAt(uint8 delayDays) private view returns (uint64) {
        uint256 t = block.timestamp + uint256(delayDays) * 1 days;
        uint256 period = PeriodMath.periodOf(t);
        uint256 start = PeriodMath.startOfDay(period, 1);
        // slither-disable-next-line incorrect-equality (calendar boundary, not a balance)
        return SafeCast.toUint64(start == t ? t : PeriodMath.startOfDay(period + 1, 1));
    }

    function _apply(Store storage g, Rules.Params storage current, uint128 installment) private {
        uint64 at = g.effectiveAt;
        Rules.Params memory next = g.pendingRules;
        // Bounds are fixed in code, so this can't fail for rules checked at proposal time.
        Rules.validate(next, installment);
        g.effectiveAt = 0;
        delete g.pendingRules;
        _copy(current, next);
        emit RuleChangeApplied(at);
    }

    /// @dev Field by field: a storage pointer parameter can't take a whole-struct assignment.
    function _copy(Rules.Params storage dst, Rules.Params memory src) private {
        dst.interestBps = src.interestBps;
        dst.tenorMonths = src.tenorMonths;
        dst.tenor2Bps = src.tenor2Bps;
        dst.tenor3Bps = src.tenor3Bps;
        dst.reserveBps = src.reserveBps;
        dst.maxLoanBps = src.maxLoanBps;
        dst.kMultiplier = src.kMultiplier;
        dst.minInterestMonth = src.minInterestMonth;
        dst.medicalCap = src.medicalCap;
        dst.medicalFreeMonths = src.medicalFreeMonths;
        dst.guarantorRequired = src.guarantorRequired;
        dst.interestFee = src.interestFee;
        dst.defaultAfter = src.defaultAfter;
        dst.minMembersForLoans = src.minMembersForLoans;
        dst.passPct = src.passPct;
        dst.dissolvePassPct = src.dissolvePassPct;
        dst.ruleChangeDelayDays = src.ruleChangeDelayDays;
        dst.exitNoticeDays = src.exitNoticeDays;
        dst.exitFeeBps = src.exitFeeBps;
    }

    /// @dev Reverts unless `id` is an open proposal.
    function _openProposal(Store storage g, uint256 id) private view returns (Proposal storage pr) {
        if (id == 0 || id > g.proposals.length) revert ProposalNotOpen(id);
        pr = g.proposals[id - 1];
        if (pr.status != Status.Open) revert ProposalNotOpen(id);
    }
}
