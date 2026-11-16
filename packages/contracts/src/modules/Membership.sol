// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {PeriodMath} from "../libraries/PeriodMath.sol";
import {DisplayName} from "../libraries/DisplayName.sol";
import {ICircleRegistry} from "../interfaces/ICircleRegistry.sol";

/// @title Membership
/// @notice Who is in a circle and how that changes: founder invites, join requests decided by a
///         member vote (ADR 0028), dormant members (ADR 0010, 0032) and display names (ADR 0029).
/// @dev An external library (ADR 0031): deployed once per chain and linked into CircleVault at
///      build time. The vault delegatecalls it, so all state lives in the vault's `Store`. The
///      library address is fixed in the vault's bytecode; nothing can swap it (ADR 0020: no
///      proxies, no upgrades). Every write is O(1) (ADR 0015). All times are UTC (ADR 0014).
library Membership {
    // ------------------------------------------------------------------ types

    struct Member {
        bool active;
        /// @dev Voted dormant (ADR 0032): owes nothing, can't vote, shares stay. Ends on `wake`.
        bool dormant;
        /// @dev Has voting rights: founders from the start; members admitted by vote once they
        ///      have paid `minPaidToVote` installments (ADR 0033, RT-03). Kept while dormant.
        bool voter;
        /// @dev Frozen by a loan default (own loan or as guarantor, ADR 0009): can't exit, and the
        ///      shares may repay the loan after a vote. Set and cleared by LoanBook only.
        bool frozen;
        /// @dev Open loan, pending loan request or active guarantee (ADR 0037). Written by LoanBook
        ///      only; Exits refuses to exit a member while it is above 0.
        uint8 loanTies;
        /// @dev Next period this member must pay; payments are always oldest first.
        uint32 nextPeriod;
        /// @dev Voting stamp: set on joining, renewed when voting rights arrive and on wake.
        ///      A member votes only on requests made after it.
        uint32 seq;
        /// @dev Last time the display name was set (0 = never set).
        uint64 nameChangedAt;
        /// @dev Installments paid so far.
        uint16 paid;
        /// @dev Asked to exit and waiting for the payout (ADR 0039, 0043): can't vote, propose,
        ///      borrow or guarantee, and isn't counted in `voterCount`. Set and cleared by Exits.
        bool exiting;
        uint128 shares;
    }

    enum Kind {
        /// @dev Someone asks to join. `account` is the applicant.
        Join,
        /// @dev A member asks the circle to mark `account` dormant.
        Dormant
    }

    enum Status {
        None,
        Open,
        Approved,
        Rejected,
        /// @dev Voting window ended without quorum.
        Expired,
        /// @dev Withdrawn by the applicant, or (dormant) the member caught up before it closed.
        Cancelled,
        /// @dev Join vote passed but the circle hit `maxMembers` first.
        Full
    }

    struct Request {
        Kind kind;
        /// @dev Join: the applicant. Dormant: the member it is about.
        address account;
        uint64 deadline;
        /// @dev Voters possible at request time: the quorum denominator.
        uint32 eligible;
        /// @dev Join: member who vouched (optional). Dormant: the member who proposed it.
        address invitedBy;
        /// @dev Only members with seq <= seqSnapshot can vote (in the circle before the request).
        uint32 seqSnapshot;
        uint32 yes;
        uint32 no;
        Status status;
        /// @dev Join: true once `invitedBy` voted yes, so nobody can borrow a trusted member's
        ///      name (red-team A-01). Dormant: always true (the proposer's yes is counted).
        bool inviterConfirmed;
        /// @dev Join: the name asked for. Dormant: empty.
        string displayName;
    }

    /// @dev The vault's immutable settings this module needs.
    struct Params {
        address factory;
        uint8 dueDay;
        uint32 votingWindow;
        uint8 quorumPct;
        uint16 maxMembers;
        uint8 dormantAfter;
        uint8 minPaidToVote;
    }

    struct Store {
        mapping(address member => Member) members;
        /// @dev Members right now, dormant included (the `maxMembers` cap, 3..50, counts them).
        uint256 memberCount;
        uint256 dormantCount;
        /// @dev Members who can vote right now: voter, active, not dormant. Every quorum
        ///      denominator starts here (ADR 0033), kept O(1) without looping (ADR 0015).
        uint256 voterCount;
        /// @dev Open requests naming a member as inviter (join) or proposer (dormant).
        mapping(address member => uint256) openBy;
        /// @dev Members admitted with `member` as their confirmed inviter.
        mapping(address member => uint256) admittedVia;
        uint32 seqCounter;
        /// @dev Founder invites not yet accepted, declined or cleared. Each holds a seat until
        ///      `invitesExpireAt`, so a join vote can't take a late founder's seat (RT-USDT-03).
        ///      Packed into `seqCounter`'s slot, so no storage moves.
        uint32 pendingInvites;
        /// @dev When every founder invite expires (all are made at creation with one TTL).
        uint64 invitesExpireAt;
        /// @dev Every address that was ever a member, once each, for paginated reads.
        address[] memberList;
        mapping(address account => bool) listed;
        mapping(address member => mapping(uint256 period => bool)) holidayFor;
        mapping(address member => mapping(uint256 year => uint256)) holidaysUsed;
        /// @dev Late fees on this member's installment for this period waived by a vote
        ///      (Governance, D4b). The vault charges no late fee for a waived period.
        mapping(address member => mapping(uint256 period => bool)) feeWaived;
        mapping(address account => uint64 expiresAt) founderInviteExpiry;
        /// @dev Request id `n` lives at index `n - 1`; id 0 means "none".
        Request[] requests;
        mapping(address applicant => uint256 requestId) openJoinOf;
        mapping(address member => uint256 requestId) openDormantOf;
        mapping(uint256 requestId => mapping(address voter => bool)) hasVoted;
        /// @dev Open request ids, swap-and-pop; `openPos` is index + 1.
        uint256[] openIds;
        mapping(uint256 requestId => uint256) openPos;
        mapping(address member => string) names;
        /// @dev Last owner of a lowercased name key.
        mapping(bytes32 nameKey => address) nameOwner;
        /// @dev 0 while the owner uses the name; otherwise when the dropped name becomes free.
        mapping(bytes32 nameKey => uint64) nameFreeAt;
    }

    // ------------------------------------------------------------------ constants

    /// @dev Creator plus invited founders; also the highest `maxMembers` (ADR 0045).
    uint256 internal constant MAX_FOUNDERS = 50;
    /// @dev Share of votes cast that must be yes to admit someone (RT-03).
    uint256 internal constant ADMISSION_PASS_PCT = 66;
    /// @dev Dormant passes with more than half the votes cast (PLAN.md §3 pass mark default).
    uint256 internal constant DORMANT_PASS_PCT = 50;
    /// @dev Open requests allowed at once, so spam can't flood the Votes page (RT-05).
    uint256 internal constant MAX_OPEN_REQUESTS = 20;
    /// @dev Open requests that may name one member as inviter or proposer (RT-03, RT-05).
    uint256 internal constant MAX_OPEN_PER_MEMBER = 3;
    /// @dev How long an invited founder has to accept (RT-02).
    uint64 internal constant FOUNDER_INVITE_TTL = 14 days;
    /// @dev Minimum time between display-name changes, and how long a dropped name stays
    ///      reserved for its last owner (PLAN.md D3b, RT-06).
    uint64 internal constant NAME_COOLDOWN = 30 days;
    /// @dev Members further behind than this many periods can't vote (RT-07).
    uint256 internal constant MAX_PERIODS_BEHIND_TO_VOTE = 1;
    uint256 private constant PERCENT = 100;

    // ------------------------------------------------------------------ events

    event MemberAdded(address indexed member, uint256 indexed joinPeriod);
    event FounderInvited(address indexed account, uint256 expiresAt);
    event FounderInviteDeclined(address indexed account);
    event JoinRequested(
        uint256 indexed requestId,
        address indexed applicant,
        address indexed invitedBy,
        string displayName,
        uint256 deadline,
        uint256 eligible
    );
    event DormantProposed(
        uint256 indexed requestId,
        address indexed member,
        address indexed proposer,
        uint256 periodsOverdue,
        uint256 deadline,
        uint256 eligible
    );
    event Voted(uint256 indexed requestId, address indexed voter, bool support);
    event RequestClosed(uint256 indexed requestId, Kind kind, Status status);
    event MemberDormant(address indexed member, uint256 indexed period);
    event MemberWoke(address indexed member, uint256 indexed nextPeriod);
    event MemberRemoved(address indexed member);
    /// @notice A member admitted by vote paid enough installments to vote (ADR 0033).
    event VotingRightsGranted(address indexed member);
    event DisplayNameSet(address indexed member, string displayName);
    /// @notice The name a newcomer asked for was taken before they were admitted; they joined
    ///         without a name and pick one with `setDisplayName`.
    event DisplayNameUnavailable(address indexed member, string requested);

    // ------------------------------------------------------------------ errors

    error TooManyFounders(uint256 count);
    error DuplicateMember(address member);
    error ZeroAddressMember();
    error NotAMember(address account);
    error MemberIsDormant(address account);
    error NotDormant(address account);
    error NoFounderInvite();
    error FounderInviteExpired(uint256 expiredAt);
    error AlreadyMember(address account);
    error RequestAlreadyOpen(uint256 requestId);
    error TooManyOpenRequests();
    error TooManyOpenRequestsBy(address member);
    error CircleFull(uint256 maxMembers);
    error InvitedByNotAMember(address invitedBy);
    error InvalidDisplayName();
    error NameTaken();
    error NameChangeTooSoon(uint256 allowedAt);
    error RequestNotOpen(uint256 requestId);
    error VotingClosed(uint256 requestId);
    error NotEligibleToVote(uint256 requestId, address voter);
    error AlreadyVoted(uint256 requestId);
    error NotDecidedYet(uint256 requestId);
    error NoOpenRequest();
    error NotOverdueEnough(uint256 periodsOverdue, uint256 required);
    error NoOtherVoters();

    // ------------------------------------------------------------------ setup

    /// @notice Add the creator as first member and invite the other founders (constructor only).
    /// @dev One-time loop bounded by MAX_FOUNDERS at deployment; no later write loops (ADR 0015).
    function init(Store storage s, Params calldata p, address creator, address[] calldata invitees)
        external
        returns (uint32 startPeriod)
    {
        if (creator == address(0)) revert ZeroAddressMember();
        if (invitees.length + 1 > MAX_FOUNDERS) revert TooManyFounders(invitees.length + 1);
        startPeriod = _firstPeriod(p.dueDay);
        _addMember(s, creator, startPeriod, true);

        uint64 expiresAt = SafeCast.toUint64(block.timestamp) + FOUNDER_INVITE_TTL;
        // forge-lint: disable-next-line(require-revert-in-loop)
        for (uint256 i = 0; i < invitees.length; ++i) {
            address f = invitees[i];
            if (f == address(0)) revert ZeroAddressMember();
            if (f == creator || s.founderInviteExpiry[f] != 0) revert DuplicateMember(f);
            s.founderInviteExpiry[f] = expiresAt;
            emit FounderInvited(f, expiresAt);
        }
        s.pendingInvites = SafeCast.toUint32(invitees.length);
        s.invitesExpireAt = expiresAt;
    }

    // ------------------------------------------------------------------ founder invites

    function acceptInvite(Store storage s, Params calldata p) external {
        uint64 expiresAt = s.founderInviteExpiry[msg.sender];
        if (expiresAt == 0) revert NoFounderInvite();
        if (block.timestamp > expiresAt) revert FounderInviteExpired(expiresAt);
        // Real seats only: this founder's own seat was held for them.
        if (s.memberCount >= p.maxMembers) revert CircleFull(p.maxMembers);
        _clearInvite(s, msg.sender);
        // Founders were chosen by the creator and vote from the start.
        _addMember(s, msg.sender, _firstPeriod(p.dueDay), true);
        ICircleRegistry(p.factory).registerMember(msg.sender);
    }

    function declineInvite(Store storage s) external {
        if (s.founderInviteExpiry[msg.sender] == 0) revert NoFounderInvite();
        _clearInvite(s, msg.sender);
        emit FounderInviteDeclined(msg.sender);
    }

    // ------------------------------------------------------------------ requests

    function requestToJoin(
        Store storage s,
        Params calldata p,
        string calldata displayName,
        address invitedBy
    ) external returns (uint256 id) {
        if (s.members[msg.sender].active) {
            revert AlreadyMember(msg.sender);
        }
        uint64 founderExpiry = s.founderInviteExpiry[msg.sender];
        if (founderExpiry != 0) {
            // A live founder invite: accept it instead. An expired one is cleared.
            if (block.timestamp <= founderExpiry) revert AlreadyMember(msg.sender);
            _clearInvite(s, msg.sender);
        }
        uint256 open = s.openJoinOf[msg.sender];
        if (open != 0) revert RequestAlreadyOpen(open);
        if (_isFull(s, p)) revert CircleFull(p.maxMembers);
        if (invitedBy != address(0) && !_isVoter(s.members[invitedBy])) {
            revert InvitedByNotAMember(invitedBy);
        }
        if (!DisplayName.isValid(displayName)) revert InvalidDisplayName();
        if (!_isNameFree(s, DisplayName.key(displayName), msg.sender)) revert NameTaken();

        uint32 eligible = SafeCast.toUint32(s.voterCount);
        id = _open(s, p, Kind.Join, msg.sender, invitedBy, eligible, displayName);
        s.openJoinOf[msg.sender] = id;
        emit JoinRequested(
            id, msg.sender, invitedBy, displayName, s.requests[id - 1].deadline, eligible
        );
    }

    /// @notice A member asks the circle to mark `member` dormant (ADR 0032). Allowed once the
    ///         member has missed `dormantAfter` installments. The proposer's yes is counted.
    function proposeDormant(Store storage s, Params calldata p, address member)
        external
        returns (uint256 id)
    {
        Member storage m = s.members[member];
        if (!m.active) revert NotAMember(member);
        if (m.dormant) revert MemberIsDormant(member);
        if (member == msg.sender) revert NotEligibleToVote(0, msg.sender);
        uint256 open = s.openDormantOf[member];
        if (open != 0) revert RequestAlreadyOpen(open);
        uint256 overdue = periodsOverdue(s, member, p.dueDay);
        if (overdue < p.dormantAfter) revert NotOverdueEnough(overdue, p.dormantAfter);
        if (!_isCurrentVoter(s.members[msg.sender])) revert NotEligibleToVote(0, msg.sender);

        // Everyone who could vote now, minus the member it is about (they can't vote on it).
        // The proposer is a voter and isn't the member, so this is at least 1.
        uint256 voters = s.voterCount - (m.voter && !m.exiting ? 1 : 0);
        id = _open(s, p, Kind.Dormant, member, msg.sender, SafeCast.toUint32(voters), "");
        s.openDormantOf[member] = id;
        Request storage r = s.requests[id - 1];
        r.inviterConfirmed = true;
        emit DormantProposed(id, member, msg.sender, overdue, r.deadline, voters);
        _castVote(s, p, id, r, true);
    }

    function vote(Store storage s, Params calldata p, uint256 id, bool support) external {
        Request storage r = _openRequest(s, id);
        if (block.timestamp > r.deadline) revert VotingClosed(id);
        if (!_canVoteOn(s, r, msg.sender)) revert NotEligibleToVote(id, msg.sender);
        if (s.hasVoted[id][msg.sender]) revert AlreadyVoted(id);
        _castVote(s, p, id, r, support);
    }

    function finalize(Store storage s, Params calldata p, uint256 id) external {
        Request storage r = _openRequest(s, id);
        Status outcome = _outcome(r, p.quorumPct, block.timestamp > r.deadline);
        if (outcome == Status.Open) revert NotDecidedYet(id);
        _close(s, p, id, r, outcome);
    }

    function cancelJoinRequest(Store storage s, Params calldata p) external {
        uint256 id = s.openJoinOf[msg.sender];
        // slither-disable-next-line incorrect-equality (0 is the "no request" sentinel)
        if (id == 0) revert NoOpenRequest();
        _close(s, p, id, s.requests[id - 1], Status.Cancelled);
    }

    // ------------------------------------------------------------------ dormant

    /// @notice A dormant member comes back. Dues restart like a new member's (this month if its
    ///         due moment hasn't passed, otherwise next month); the months in between bought no
    ///         shares and aren't owed (ADR 0032).
    function wake(Store storage s, Params calldata p) external {
        _wake(s, msg.sender, _firstPeriod(p.dueDay));
    }

    /// @notice Wake because the member is paying (RT-11): the payment covers the current period,
    ///         with its usual late fees if its due moment has passed.
    function wakeToPay(Store storage s) external {
        _wake(s, msg.sender, SafeCast.toUint32(PeriodMath.periodOf(block.timestamp)));
    }

    // ------------------------------------------------------------------ display names

    function setDisplayName(Store storage s, string calldata displayName) external {
        Member storage m = s.members[msg.sender];
        if (!m.active) revert NotAMember(msg.sender);
        if (m.dormant) revert MemberIsDormant(msg.sender);
        if (m.nameChangedAt != 0 && block.timestamp < uint256(m.nameChangedAt) + NAME_COOLDOWN) {
            revert NameChangeTooSoon(uint256(m.nameChangedAt) + NAME_COOLDOWN);
        }
        if (!DisplayName.isValid(displayName)) revert InvalidDisplayName();
        bytes32 newKey = DisplayName.key(displayName);
        if (!_isNameFree(s, newKey, msg.sender)) revert NameTaken();
        _takeName(s, msg.sender, displayName, newKey);
    }

    // ------------------------------------------------------------------ views

    // The vault forwards these views here unchanged (`CircleVault._view`, ADR 0038), so it never
    // decodes and re-encodes the structs and strings itself.

    function getRequest(Store storage s, uint256 id) external view returns (Request memory) {
        return s.requests[id - 1];
    }

    function memberOf(Store storage s, address account) external view returns (Member memory) {
        return s.members[account];
    }

    function nameOf(Store storage s, address member) external view returns (string memory) {
        return s.names[member];
    }

    function membersPage(Store storage s, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        address[] storage list = s.memberList;
        uint256 len = list.length;
        if (offset >= len) return new address[](0);
        uint256 end = offset + limit > len ? len : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = list[i];
        }
    }

    function canVote(Store storage s, uint256 id, address voter) external view returns (bool) {
        if (id == 0 || id > s.requests.length) return false;
        Request storage r = s.requests[id - 1];
        return r.status == Status.Open && block.timestamp <= r.deadline && _canVoteOn(s, r, voter)
            && !s.hasVoted[id][voter];
    }

    function openRequestsPage(Store storage s, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, Request[] memory page)
    {
        uint256 len = s.openIds.length;
        if (offset >= len) return (new uint256[](0), new Request[](0));
        uint256 end = offset + limit > len ? len : offset + limit;
        ids = new uint256[](end - offset);
        page = new Request[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            ids[i - offset] = s.openIds[i];
            page[i - offset] = s.requests[s.openIds[i] - 1];
        }
    }

    function memberByName(Store storage s, string calldata displayName)
        external
        view
        returns (address)
    {
        if (!DisplayName.isValid(displayName)) return address(0);
        bytes32 k = DisplayName.key(displayName);
        address holder = s.nameOwner[k];
        // slither-disable-next-line incorrect-equality (0 means "in use"; a flag, not a balance)
        return s.members[holder].active && s.nameFreeAt[k] == 0 ? holder : address(0);
    }

    function isNameAvailable(Store storage s, string calldata displayName, address account)
        external
        view
        returns (bool)
    {
        return DisplayName.isValid(displayName)
            && _isNameFree(s, DisplayName.key(displayName), account);
    }

    /// @notice Count one paid installment; grant voting rights once `minPaidToVote` is reached.
    /// @dev Internal (inlined into the vault's `contribute`). A fresh stamp means the new voter
    ///      votes only on requests opened from now on.
    function recordPayment(Store storage s, address who, uint8 minPaidToVote) internal {
        Member storage m = s.members[who];
        m.paid += 1;
        if (!m.voter && m.paid >= minPaidToVote) {
            m.voter = true;
            m.seq = ++s.seqCounter;
            // A member who is leaving gets the right now but is counted when the exit is cancelled.
            if (!m.exiting) s.voterCount += 1;
            emit VotingRightsGranted(who);
        }
    }

    // ------------------------------------------------------------------ hooks for other modules

    /// @notice True if `who` can vote right now: active, not dormant, has voting rights, at most
    ///         one period behind (ADR 0028, 0033). LoanBook and Governance use the same test.
    function isCurrentVoter(Store storage s, address who) internal view returns (bool) {
        return _isCurrentVoter(s.members[who]);
    }

    /// @notice True if `who` was a voter before stamp `seqSnapshot` and can vote now.
    function canVoteAt(Store storage s, address who, uint32 seqSnapshot)
        internal
        view
        returns (bool)
    {
        Member storage m = s.members[who];
        return m.seq <= seqSnapshot && _isCurrentVoter(m);
    }

    /// @notice Marks `who` as leaving (`on`) or staying after all. A leaving member is taken out
    ///         of `voterCount`; one who stays is counted again with a fresh stamp, so they vote
    ///         only on proposals opened from now on and `yes + no <= eligible` still holds.
    /// @dev Exits only, for an active member. Dormant members aren't counted either way.
    function setExiting(Store storage s, address who, bool on) internal {
        Member storage m = s.members[who];
        m.exiting = on;
        if (!m.voter || m.dormant) return;
        if (on) {
            s.voterCount -= 1;
        } else {
            s.voterCount += 1;
            m.seq = ++s.seqCounter;
        }
    }

    /// @notice True if `who` counts in `voterCount`: active, a voter, not dormant, not leaving.
    function inVoterCount(Store storage s, address who) internal view returns (bool) {
        Member storage m = s.members[who];
        return m.active && m.voter && !m.dormant && !m.exiting;
    }

    /// @notice Removes `who` (an exit or dissolution, Phase 2). Counts stay exact; the member
    ///         list keeps the address for history, and the name is released after the cooldown.
    function removeMember(Store storage s, address who) internal {
        Member storage m = s.members[who];
        if (!m.active) revert NotAMember(who);
        if (m.dormant) s.dormantCount -= 1;
        else if (m.voter && !m.exiting) s.voterCount -= 1;
        s.memberCount -= 1;
        string memory current = s.names[who];
        if (bytes(current).length != 0) {
            s.nameFreeAt[DisplayName.key(current)] =
                SafeCast.toUint64(block.timestamp) + NAME_COOLDOWN;
        }
        m.active = false;
        m.dormant = false;
        m.voter = false;
        m.frozen = false;
        m.exiting = false;
        m.shares = 0;
        emit MemberRemoved(who);
    }

    /// @notice Installments whose fee-free deadline has passed and that are still unpaid.
    /// @dev Only the latest past-due period can still be inside a holiday's grace (ADR 0017):
    ///      every earlier one is past the next period's due moment too. 0 for dormant members.
    function periodsOverdue(Store storage s, address who, uint8 dueDay)
        internal
        view
        returns (uint256 n)
    {
        Member storage m = s.members[who];
        if (!m.active || m.dormant) return 0;
        uint256 next = m.nextPeriod;
        uint256 cur = PeriodMath.periodOf(block.timestamp);
        if (next > cur) return 0;
        uint256 last = block.timestamp > PeriodMath.dueMoment(cur, dueDay) ? cur : cur - 1;
        if (last < next) return 0;
        n = last - next + 1;
        if (s.holidayFor[who][last] && block.timestamp <= PeriodMath.dueMoment(last + 1, dueDay)) {
            n -= 1;
        }
    }

    // ------------------------------------------------------------------ internals

    /// @dev First period a new or returning member owes: this month if its due moment hasn't
    ///      passed, otherwise next month, so nobody starts already late (ADR 0028, RT-09).
    function _firstPeriod(uint8 dueDay) private view returns (uint32) {
        uint256 current = PeriodMath.periodOf(block.timestamp);
        uint256 first =
            block.timestamp <= PeriodMath.dueMoment(current, dueDay) ? current : current + 1;
        return SafeCast.toUint32(first);
    }

    /// @dev A fresh join stamp means the member votes only on requests made from now on, which
    ///      keeps `yes + no <= eligible` on requests opened while they were dormant.
    function _wake(Store storage s, address who, uint32 next) private {
        Member storage m = s.members[who];
        if (!m.active) revert NotAMember(who);
        if (!m.dormant) revert NotDormant(who);
        m.dormant = false;
        m.nextPeriod = next;
        m.seq = ++s.seqCounter;
        s.dormantCount -= 1;
        if (m.voter && !m.exiting) s.voterCount += 1;
        emit MemberWoke(who, next);
    }

    /// @dev Fresh record every time; listed once even if the address rejoins later (RT-09).
    function _addMember(Store storage s, address who, uint32 firstPeriod, bool voter) private {
        uint32 seq = ++s.seqCounter;
        s.members[who] = Member({
            active: true,
            dormant: false,
            voter: voter,
            frozen: false,
            loanTies: 0,
            nextPeriod: firstPeriod,
            seq: seq,
            nameChangedAt: 0,
            paid: 0,
            exiting: false,
            shares: 0
        });
        s.memberCount += 1;
        if (voter) s.voterCount += 1;
        if (!s.listed[who]) {
            s.listed[who] = true;
            s.memberList.push(who);
        }
        emit MemberAdded(who, firstPeriod);
    }

    /// @dev Full for newcomers: members plus seats held for founder invites still live
    ///      (RT-USDT-03). `acceptInvite` checks real seats only.
    function _isFull(Store storage s, Params calldata p) private view returns (bool) {
        uint256 held = block.timestamp <= s.invitesExpireAt ? s.pendingInvites : 0;
        return s.memberCount + held >= p.maxMembers;
    }

    /// @dev Removes a founder invite and the seat it held. Each invite is cleared once.
    function _clearInvite(Store storage s, address account) private {
        delete s.founderInviteExpiry[account];
        s.pendingInvites -= 1;
    }

    function _isVoter(Member storage m) private view returns (bool) {
        return m.active && !m.dormant;
    }

    /// @dev Active, not dormant, not leaving, not frozen by a loan default, and at most one
    ///      period behind (RT-03, RT-07, EXIT-06, LOAN-08). A member still inside their first
    ///      unpaid month is not behind.
    function _isCurrentVoter(Member storage m) private view returns (bool) {
        return _isVoter(m) && m.voter && !m.exiting && !m.frozen
            && uint256(m.nextPeriod) + MAX_PERIODS_BEHIND_TO_VOTE
                >= PeriodMath.periodOf(block.timestamp);
    }

    /// @dev In the circle before the request, not the member a dormant vote is about.
    function _canVoteOn(Store storage s, Request storage r, address voter)
        private
        view
        returns (bool)
    {
        Member storage m = s.members[voter];
        if (m.seq > r.seqSnapshot) return false;
        if (r.kind == Kind.Dormant && voter == r.account) return false;
        return _isCurrentVoter(m);
    }

    function _open(
        Store storage s,
        Params calldata p,
        Kind kind,
        address account,
        address invitedBy,
        uint32 eligible,
        string memory displayName
    ) private returns (uint256 id) {
        if (s.openIds.length >= MAX_OPEN_REQUESTS) {
            revert TooManyOpenRequests();
        }
        if (eligible == 0) revert NoOtherVoters();
        if (invitedBy != address(0)) {
            if (s.openBy[invitedBy] >= MAX_OPEN_PER_MEMBER) {
                revert TooManyOpenRequestsBy(invitedBy);
            }
            s.openBy[invitedBy] += 1;
        }
        s.requests
            .push(
                Request({
                    kind: kind,
                    account: account,
                    deadline: SafeCast.toUint64(block.timestamp) + p.votingWindow,
                    eligible: eligible,
                    invitedBy: invitedBy,
                    seqSnapshot: s.seqCounter,
                    yes: 0,
                    no: 0,
                    status: Status.Open,
                    inviterConfirmed: false,
                    displayName: displayName
                })
            );
        id = s.requests.length;
        s.openIds.push(id);
        s.openPos[id] = s.openIds.length;
    }

    function _castVote(
        Store storage s,
        Params calldata p,
        uint256 id,
        Request storage r,
        bool support
    ) private {
        s.hasVoted[id][msg.sender] = true;
        if (support) {
            r.yes += 1;
            if (msg.sender == r.invitedBy) r.inviterConfirmed = true;
        } else {
            r.no += 1;
        }
        emit Voted(id, msg.sender, support);

        Status outcome = _outcome(r, p.quorumPct, false);
        if (outcome != Status.Open) _close(s, p, id, r, outcome);
    }

    /// @dev Join passes with 66% yes of votes cast (>=); dormant with more than 50% (>).
    function _passes(Kind kind, uint256 yes, uint256 total) private pure returns (bool) {
        return kind == Kind.Join
            ? yes * PERCENT >= ADMISSION_PASS_PCT * total
            : yes * PERCENT > DORMANT_PASS_PCT * total;
    }

    /// @dev Open = not decided yet. Passes on quorum (of `eligible`) plus the pass mark of votes
    ///      cast. Decided early only when the remaining votes can't change the result.
    function _outcome(Request storage r, uint8 quorumPct, bool ended)
        private
        view
        returns (Status)
    {
        // yes + no <= e: only voters with seq <= seqSnapshot that aren't dormant (and, for a
        // dormant vote, aren't its subject) vote, and at most `eligible` such members existed at
        // request time; gaining voting rights and waking both renew seq. So `e - no` can't
        // underflow.
        uint256 e = r.eligible;
        uint256 yes = r.yes;
        uint256 no = r.no;
        uint256 cast = yes + no;
        bool quorum = cast * PERCENT >= uint256(quorumPct) * e;
        // Passes even if every remaining voter votes no, and quorum is already met.
        if (quorum && _passes(r.kind, yes, e)) return Status.Approved;
        // Fails even if every remaining voter votes yes.
        if (!_passes(r.kind, e - no, e)) return Status.Rejected;
        if (!ended) return Status.Open;
        if (!quorum) return Status.Expired;
        return _passes(r.kind, yes, cast) ? Status.Approved : Status.Rejected;
    }

    /// @dev Effects first; the only external call is the trusted factory registry, last.
    function _close(
        Store storage s,
        Params calldata p,
        uint256 id,
        Request storage r,
        Status outcome
    ) private {
        address account = r.account;
        Kind kind = r.kind;
        if (kind == Kind.Join) {
            if (outcome == Status.Approved && _isFull(s, p)) outcome = Status.Full;
            delete s.openJoinOf[account];
        } else {
            // The member caught up while the vote ran: nothing to do.
            if (outcome == Status.Approved && periodsOverdue(s, account, p.dueDay) < p.dormantAfter)
            {
                outcome = Status.Cancelled;
            }
            delete s.openDormantOf[account];
        }
        r.status = outcome;
        if (r.invitedBy != address(0)) s.openBy[r.invitedBy] -= 1;

        uint256 pos = s.openPos[id];
        uint256 lastId = s.openIds[s.openIds.length - 1];
        s.openIds[pos - 1] = lastId;
        s.openPos[lastId] = pos;
        s.openIds.pop();
        delete s.openPos[id];
        emit RequestClosed(id, kind, outcome);

        if (outcome != Status.Approved) return;
        if (kind == Kind.Dormant) {
            Member storage target = s.members[account];
            target.dormant = true;
            s.dormantCount += 1;
            if (target.voter && !target.exiting) s.voterCount -= 1;
            emit MemberDormant(account, PeriodMath.periodOf(block.timestamp));
            return;
        }
        if (r.inviterConfirmed && r.invitedBy != address(0)) s.admittedVia[r.invitedBy] += 1;
        _addMember(s, account, _firstPeriod(p.dueDay), p.minPaidToVote == 0);
        // Names aren't held while a vote runs, so check again (RT-06): never revert a passed vote.
        bytes32 k = DisplayName.key(r.displayName);
        if (_isNameFree(s, k, account)) _takeName(s, account, r.displayName, k);
        else emit DisplayNameUnavailable(account, r.displayName);
        ICircleRegistry(p.factory).registerMember(account);
    }

    /// @dev Free if nobody ever held it, `account` held it last, or its reservation ran out.
    function _isNameFree(Store storage s, bytes32 k, address account) private view returns (bool) {
        address holder = s.nameOwner[k];
        if (holder == address(0) || holder == account) return true;
        uint64 freeAt = s.nameFreeAt[k];
        return freeAt != 0 && block.timestamp >= freeAt;
    }

    /// @dev Moves `who` to `newKey`; their previous name stays reserved for them for the cooldown.
    function _takeName(Store storage s, address who, string memory displayName, bytes32 newKey)
        private
    {
        string memory old = s.names[who];
        if (bytes(old).length != 0) {
            bytes32 oldKey = DisplayName.key(old);
            if (oldKey != newKey) {
                s.nameFreeAt[oldKey] = SafeCast.toUint64(block.timestamp) + NAME_COOLDOWN;
            }
        }
        s.nameOwner[newKey] = who;
        s.nameFreeAt[newKey] = 0;
        s.names[who] = displayName;
        s.members[who].nameChangedAt = SafeCast.toUint64(block.timestamp);
        emit DisplayNameSet(who, displayName);
    }

    /// @dev Reverts unless `id` is an open request.
    function _openRequest(Store storage s, uint256 id) private view returns (Request storage r) {
        if (id == 0 || id > s.requests.length) revert RequestNotOpen(id);
        r = s.requests[id - 1];
        if (r.status != Status.Open) revert RequestNotOpen(id);
    }
}
