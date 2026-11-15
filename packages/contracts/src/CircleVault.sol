// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {PeriodMath} from "./libraries/PeriodMath.sol";
import {SharesMath} from "./libraries/SharesMath.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {DisplayName} from "./libraries/DisplayName.sol";
import {ICircleRegistry} from "./interfaces/ICircleRegistry.sol";

/// @title CircleVault
/// @notice One savings circle: members contribute a fixed AVAX installment each month and receive
///         non-transferable shares at the current NAV. Late fees go into the vault. Founders
///         named by the creator must accept; anyone else joins by a request and a member vote.
///         Everyone picks their own display name.
/// @dev Immutable (ADR 0020): no proxy, no upgrade path, no owner that can move funds.
///      All accounting is O(1) per action (ADR 0015) and uses internal bookkeeping, never
///      `address(this).balance` (ADR 0006). All times are UTC (ADR 0014).
///      Membership: ADR 0028. Display names: ADR 0029. Fee caps: ADR 0030.
///      Loans, exits and governance follow in Phase 2.
contract CircleVault is ReentrancyGuard {
    // ------------------------------------------------------------------ types

    struct Config {
        /// @dev Circle name shown in the app, 1..48 bytes (public on-chain; no personal data).
        string name;
        /// @dev Fixed installment per period, in wei (ADR 0002).
        uint128 installment;
        /// @dev Late fee 1 (after the due day) and late fee 2 (after `secondFeeDay`), in wei.
        ///      Each is at most half the installment (ADR 0030).
        uint128 fee1;
        uint128 fee2;
        /// @dev Due day 1..28, 23:59:59 UTC (ADR 0014).
        uint8 dueDay;
        /// @dev Day after which fee 2 applies; dueDay < secondFeeDay <= 28.
        uint8 secondFeeDay;
        /// @dev Payment holidays allowed per member per UTC calendar year, 0..12 (ADR 0017).
        uint8 holidaysPerYear;
        /// @dev How long a join vote stays open, in seconds: 1 hour..14 days (ADR 0022).
        uint32 votingWindow;
        /// @dev Share of eligible members who must vote, in percent: 20..100 (ADR 0022).
        uint8 quorumPct;
        /// @dev Member cap; 0 = unlimited, otherwise >= 3 and >= creator + invited founders.
        uint16 maxMembers;
    }

    struct Member {
        bool active;
        /// @dev Next period this member must pay; payments are always oldest first.
        uint32 nextPeriod;
        /// @dev Join order stamp. A member may vote on a request only if seq <= its snapshot.
        uint32 seq;
        /// @dev Last time the display name was set (0 = never set).
        uint64 nameChangedAt;
        uint128 shares;
    }

    enum JoinStatus {
        None,
        Open,
        Approved,
        Rejected,
        /// @dev Voting window ended without quorum.
        Expired,
        Cancelled,
        /// @dev Vote passed but the circle hit `maxMembers` first.
        Full
    }

    struct JoinRequest {
        address applicant;
        uint64 deadline;
        /// @dev Active members at request time: the quorum denominator.
        uint32 eligible;
        /// @dev Member who vouched for the applicant (optional, shown to voters).
        address invitedBy;
        /// @dev Only members with seq <= seqSnapshot can vote (joined before the request).
        uint32 seqSnapshot;
        uint32 yes;
        uint32 no;
        JoinStatus status;
        /// @dev True once `invitedBy` voted yes. Until then the app shows the claim as unconfirmed,
        ///      so an applicant can't borrow a trusted member's name (red-team A-01).
        bool inviterConfirmed;
        string displayName;
    }

    // ------------------------------------------------------------------ constants

    uint256 public constant MAX_FOUNDERS = 200;
    /// @notice Avalanche C-Chain mainnet. This version has no withdrawal path yet (exits arrive in
    ///         Phase 2) and contracts are immutable, so deploying it on mainnet would lock funds.
    uint256 public constant AVALANCHE_MAINNET_CHAIN_ID = 43_114;
    uint8 public constant MAX_HOLIDAYS_PER_YEAR = 12;
    uint256 public constant MAX_NAME_BYTES = 48;
    uint32 public constant MIN_VOTING_WINDOW = 1 hours;
    uint32 public constant MAX_VOTING_WINDOW = 14 days;
    uint8 public constant MIN_QUORUM_PCT = 20;
    uint8 public constant MAX_QUORUM_PCT = 100;
    uint16 public constant MIN_MAX_MEMBERS = 3;
    /// @notice Share of votes cast that must be yes to admit someone (RT-03).
    uint256 public constant ADMISSION_PASS_PCT = 66;
    /// @notice Open join requests allowed at once, so spam can't flood the Votes page (RT-05).
    uint256 public constant MAX_OPEN_REQUESTS = 20;
    /// @notice How long an invited founder has to accept (RT-02).
    uint64 public constant FOUNDER_INVITE_TTL = 14 days;
    /// @notice Minimum time between display-name changes, and how long a dropped name stays
    ///         reserved for its last owner (PLAN.md D3b, RT-06).
    uint64 public constant NAME_COOLDOWN = 30 days;
    /// @notice Members further behind than this many periods can't vote (RT-07).
    uint256 public constant MAX_PERIODS_BEHIND_TO_VOTE = 1;
    uint256 private constant PERCENT = 100;

    // ------------------------------------------------------------------ immutable config

    uint128 public immutable installment;
    uint128 public immutable fee1;
    uint128 public immutable fee2;
    uint8 public immutable dueDay;
    uint8 public immutable secondFeeDay;
    uint8 public immutable holidaysPerYear;
    uint32 public immutable votingWindow;
    uint8 public immutable quorumPct;
    uint16 public immutable maxMembers;
    /// @notice First period the creator owes an installment for.
    uint32 public immutable startPeriod;
    address public immutable factory;
    address public immutable creator;

    // ------------------------------------------------------------------ state

    /// @notice Internally tracked assets in wei (cash + loans outstanding, once loans exist).
    uint256 public totalAssets;
    uint256 public totalShares;
    /// @notice Circle name (set once at creation).
    string public name;
    /// @notice Members right now (the creator, accepted founders and admitted members).
    uint256 public memberCount;
    /// @dev Join-order counter behind `Member.seq`.
    uint32 internal _seqCounter;
    /// @dev Every address that was ever a member, once each, for paginated reads (ADR 0015).
    address[] internal _memberList;
    mapping(address account => bool) internal _listed;

    mapping(address member => Member) internal _members;
    mapping(address member => mapping(uint256 period => bool)) public holidayFor;
    mapping(address member => mapping(uint256 year => uint256)) public holidaysUsed;

    /// @notice Founders named by the creator who haven't accepted yet: invite expiry (0 = none).
    mapping(address account => uint64 expiresAt) public founderInviteExpiry;

    /// @dev Request id `n` lives at index `n - 1`; id 0 means "none".
    JoinRequest[] internal _requests;
    mapping(address applicant => uint256 requestId) public openRequestOf;
    mapping(uint256 requestId => mapping(address voter => bool)) public hasVoted;
    /// @dev Open request ids, swap-and-pop; `_openPos` is index + 1.
    uint256[] internal _openIds;
    mapping(uint256 requestId => uint256) internal _openPos;

    mapping(address member => string) internal _names;
    /// @dev Last owner of a lowercased name key.
    mapping(bytes32 nameKey => address) internal _nameOwner;
    /// @dev 0 while the owner uses the name; otherwise when the dropped name becomes free.
    mapping(bytes32 nameKey => uint64) internal _nameFreeAt;

    // ------------------------------------------------------------------ events

    event MemberAdded(address indexed member, uint256 indexed joinPeriod);
    event Contributed(
        address indexed member,
        uint256 indexed period,
        uint256 installment,
        uint256 lateFees,
        uint256 sharesMinted
    );
    event HolidayDeclared(address indexed member, uint256 indexed period);
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
    event JoinVoted(uint256 indexed requestId, address indexed voter, bool support);
    event JoinRequestClosed(uint256 indexed requestId, JoinStatus status);
    event DisplayNameSet(address indexed member, string displayName);
    /// @notice The name a newcomer asked for was taken before they were admitted; they joined
    ///         without a name and pick one with `setDisplayName`.
    event DisplayNameUnavailable(address indexed member, string requested);

    // ------------------------------------------------------------------ errors

    error InvalidConfig(string reason);
    error TooManyFounders(uint256 count);
    error DuplicateMember(address member);
    error ZeroAddressMember();
    error NotAMember(address account);
    error AdvancePaymentNotAllowed(uint256 period, uint256 currentPeriod);
    error WrongAmount(uint256 expected, uint256 sent);
    error HolidayTooLate(uint256 period);
    error HolidayAlreadyDeclared(uint256 period);
    error HolidayLimitReached(uint256 year);
    error PeriodAlreadyPaid(uint256 period);
    error DirectTransferNotAllowed();
    error MainnetNotSupported();
    error NoFounderInvite();
    error FounderInviteExpired(uint256 expiredAt);
    error AlreadyMember(address account);
    error RequestAlreadyOpen(uint256 requestId);
    error TooManyOpenRequests();
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

    // ------------------------------------------------------------------ constructor

    /// @param cfg Circle settings (bounds per ADR 0022 / 0030).
    /// @param creator_ The wallet creating the circle; the only member at the start.
    /// @param invitees Other founders; each must call `acceptInvite` within 14 days (RT-02).
    constructor(Config memory cfg, address creator_, address[] memory invitees) {
        // Funds-stuck guard: no exits in this version (see AVALANCHE_MAINNET_CHAIN_ID).
        if (block.chainid == AVALANCHE_MAINNET_CHAIN_ID) revert MainnetNotSupported();
        uint256 nameLen = bytes(cfg.name).length;
        if (nameLen == 0 || nameLen > MAX_NAME_BYTES) {
            revert InvalidConfig("name must be 1..48 bytes");
        }
        if (cfg.installment == 0) revert InvalidConfig("installment must be > 0");
        if (uint256(cfg.fee1) * 2 > cfg.installment || uint256(cfg.fee2) * 2 > cfg.installment) {
            revert InvalidConfig("each late fee must be at most half the installment");
        }
        if (cfg.dueDay < 1 || cfg.dueDay > 28) revert InvalidConfig("dueDay must be 1..28");
        if (cfg.secondFeeDay <= cfg.dueDay || cfg.secondFeeDay > 28) {
            revert InvalidConfig("secondFeeDay must be after dueDay and <= 28");
        }
        if (cfg.holidaysPerYear > MAX_HOLIDAYS_PER_YEAR) {
            revert InvalidConfig("holidaysPerYear must be <= 12");
        }
        if (cfg.votingWindow < MIN_VOTING_WINDOW || cfg.votingWindow > MAX_VOTING_WINDOW) {
            revert InvalidConfig("votingWindow must be 1 hour..14 days");
        }
        if (cfg.quorumPct < MIN_QUORUM_PCT || cfg.quorumPct > MAX_QUORUM_PCT) {
            revert InvalidConfig("quorumPct must be 20..100");
        }
        if (creator_ == address(0)) revert ZeroAddressMember();
        // One-time, bounded loop at deployment only; no write path loops over members (ADR 0015).
        if (invitees.length + 1 > MAX_FOUNDERS) revert TooManyFounders(invitees.length + 1);
        if (
            cfg.maxMembers != 0
                && (cfg.maxMembers < MIN_MAX_MEMBERS || cfg.maxMembers < invitees.length + 1)
        ) {
            revert InvalidConfig("maxMembers must be 0 or >= 3 and >= founders");
        }

        installment = cfg.installment;
        fee1 = cfg.fee1;
        fee2 = cfg.fee2;
        dueDay = cfg.dueDay;
        secondFeeDay = cfg.secondFeeDay;
        holidaysPerYear = cfg.holidaysPerYear;
        votingWindow = cfg.votingWindow;
        quorumPct = cfg.quorumPct;
        maxMembers = cfg.maxMembers;
        name = cfg.name;
        factory = msg.sender;
        creator = creator_;

        uint32 start = _firstPeriod(cfg.dueDay);
        startPeriod = start;
        _addMember(creator_, start);

        uint64 expiresAt = SafeCast.toUint64(block.timestamp) + FOUNDER_INVITE_TTL;
        // forge-lint: disable-next-line(require-revert-in-loop)
        for (uint256 i = 0; i < invitees.length; ++i) {
            address f = invitees[i];
            if (f == address(0)) revert ZeroAddressMember();
            if (f == creator_ || founderInviteExpiry[f] != 0) revert DuplicateMember(f);
            founderInviteExpiry[f] = expiresAt;
            emit FounderInvited(f, expiresAt);
        }
    }

    // ------------------------------------------------------------------ contributions

    /// @notice Pay the oldest unpaid installment, plus any late fees owed on it.
    /// @dev `msg.value` must equal exactly `installment + lateFees` (see `amountDue`).
    function contribute() external payable nonReentrant {
        Member storage m = _members[msg.sender];
        if (!m.active) revert NotAMember(msg.sender);

        uint256 period = m.nextPeriod;
        uint256 current = PeriodMath.periodOf(block.timestamp);
        if (period > current) revert AdvancePaymentNotAllowed(period, current);

        uint256 fees = _lateFees(msg.sender, period, block.timestamp);
        uint256 expected = uint256(installment) + fees;
        if (msg.value != expected) revert WrongAmount(expected, msg.value);

        // Effects: shares are priced on the installment at the pre-payment NAV;
        // the fee then raises NAV for everyone (ADR 0009). A late joiner buys in here,
        // at today's NAV, so existing members are not diluted (ADR 0006).
        uint256 minted = SharesMath.sharesForDeposit(installment, totalAssets, totalShares);
        totalAssets += msg.value;
        totalShares += minted;
        m.shares += SafeCast.toUint128(minted);
        m.nextPeriod = SafeCast.toUint32(period + 1);

        emit Contributed(msg.sender, period, installment, fees, minted);
    }

    /// @notice Declare a payment holiday for the current period (ADR 0017): no late fees until
    ///         the next period's due date. The installment is still owed.
    function declareHoliday() external {
        Member storage m = _members[msg.sender];
        if (!m.active) revert NotAMember(msg.sender);

        uint256 period = PeriodMath.periodOf(block.timestamp);
        if (m.nextPeriod > period) revert PeriodAlreadyPaid(period);
        if (block.timestamp > PeriodMath.dueMoment(period, dueDay)) revert HolidayTooLate(period);
        if (holidayFor[msg.sender][period]) revert HolidayAlreadyDeclared(period);

        uint256 year = period / 12;
        if (holidaysUsed[msg.sender][year] >= holidaysPerYear) revert HolidayLimitReached(year);

        holidayFor[msg.sender][period] = true;
        holidaysUsed[msg.sender][year] += 1;
        emit HolidayDeclared(msg.sender, period);
    }

    // ------------------------------------------------------------------ founder invites

    /// @notice Accept the creator's invitation to be a founder. Only now do you count as a
    ///         member, in quorum and in your portfolio (RT-02).
    function acceptInvite() external nonReentrant {
        uint64 expiresAt = founderInviteExpiry[msg.sender];
        if (expiresAt == 0) revert NoFounderInvite();
        if (block.timestamp > expiresAt) revert FounderInviteExpired(expiresAt);
        if (_isFull()) revert CircleFull(maxMembers);
        delete founderInviteExpiry[msg.sender];
        _addMember(msg.sender, _firstPeriod(dueDay));
        ICircleRegistry(factory).registerMember(msg.sender);
    }

    /// @notice Turn down a founder invitation.
    function declineInvite() external {
        if (founderInviteExpiry[msg.sender] == 0) revert NoFounderInvite();
        delete founderInviteExpiry[msg.sender];
        emit FounderInviteDeclined(msg.sender);
    }

    // ------------------------------------------------------------------ join requests

    /// @notice Ask to join. The invite link is just this circle's address; the member vote is
    ///         the gate (ADR 0028).
    /// @param displayName The name you want here; checked now and again when you're admitted.
    /// @param invitedBy A member who invited you, shown to voters, or address(0).
    /// @return id The join request id.
    function requestToJoin(string calldata displayName, address invitedBy)
        external
        returns (uint256 id)
    {
        if (_members[msg.sender].active) revert AlreadyMember(msg.sender);
        uint64 founderExpiry = founderInviteExpiry[msg.sender];
        if (founderExpiry != 0) {
            // A live founder invite: accept it instead. An expired one is cleared.
            if (block.timestamp <= founderExpiry) revert AlreadyMember(msg.sender);
            delete founderInviteExpiry[msg.sender];
        }
        uint256 open = openRequestOf[msg.sender];
        if (open != 0) revert RequestAlreadyOpen(open);
        if (_openIds.length >= MAX_OPEN_REQUESTS) revert TooManyOpenRequests();
        if (_isFull()) revert CircleFull(maxMembers);
        if (invitedBy != address(0) && !_members[invitedBy].active) {
            revert InvitedByNotAMember(invitedBy);
        }
        if (!DisplayName.isValid(displayName)) revert InvalidDisplayName();
        if (!_isNameFree(DisplayName.key(displayName), msg.sender)) revert NameTaken();

        uint64 deadline = SafeCast.toUint64(block.timestamp) + votingWindow;
        uint32 eligible = SafeCast.toUint32(memberCount);
        _requests.push(
            JoinRequest({
                applicant: msg.sender,
                deadline: deadline,
                eligible: eligible,
                invitedBy: invitedBy,
                seqSnapshot: _seqCounter,
                yes: 0,
                no: 0,
                status: JoinStatus.Open,
                inviterConfirmed: false,
                displayName: displayName
            })
        );
        id = _requests.length;
        openRequestOf[msg.sender] = id;
        _openIds.push(id);
        _openPos[id] = _openIds.length;

        emit JoinRequested(id, msg.sender, invitedBy, displayName, deadline, eligible);
    }

    /// @notice Vote on a join request. Only members who joined before the request and are at
    ///         most one installment behind can vote. The vote that decides the outcome settles it.
    function voteOnJoin(uint256 id, bool support) external nonReentrant {
        JoinRequest storage r = _openRequest(id);
        if (block.timestamp > r.deadline) revert VotingClosed(id);
        if (!_canVoteOn(r, _members[msg.sender])) revert NotEligibleToVote(id, msg.sender);
        if (hasVoted[id][msg.sender]) revert AlreadyVoted(id);

        hasVoted[id][msg.sender] = true;
        if (support) {
            r.yes += 1;
            if (msg.sender == r.invitedBy) r.inviterConfirmed = true;
        } else {
            r.no += 1;
        }
        emit JoinVoted(id, msg.sender, support);

        JoinStatus outcome = _outcome(r, false);
        if (outcome != JoinStatus.Open) _close(id, r, outcome);
    }

    /// @notice Settle a request once the outcome is certain or the voting window has ended.
    ///         Anyone can call this.
    function finalizeJoin(uint256 id) external nonReentrant {
        JoinRequest storage r = _openRequest(id);
        JoinStatus outcome = _outcome(r, block.timestamp > r.deadline);
        if (outcome == JoinStatus.Open) revert NotDecidedYet(id);
        _close(id, r, outcome);
    }

    /// @notice Withdraw your own open join request.
    function cancelJoinRequest() external {
        uint256 id = openRequestOf[msg.sender];
        // slither-disable-next-line incorrect-equality (0 is the "no request" sentinel, not a balance)
        if (id == 0) revert NoOpenRequest();
        _close(id, _requests[id - 1], JoinStatus.Cancelled);
    }

    // ------------------------------------------------------------------ display names

    /// @notice Set or change your display name in this circle (ADR 0029). The first name is
    ///         free to set; after that, one change per `NAME_COOLDOWN`, and your old name stays
    ///         reserved for you for the same time.
    function setDisplayName(string calldata displayName) external {
        Member storage m = _members[msg.sender];
        if (!m.active) revert NotAMember(msg.sender);
        if (m.nameChangedAt != 0 && block.timestamp < uint256(m.nameChangedAt) + NAME_COOLDOWN) {
            revert NameChangeTooSoon(uint256(m.nameChangedAt) + NAME_COOLDOWN);
        }
        if (!DisplayName.isValid(displayName)) revert InvalidDisplayName();
        bytes32 newKey = DisplayName.key(displayName);
        if (!_isNameFree(newKey, msg.sender)) revert NameTaken();
        _takeName(msg.sender, displayName, newKey);
    }

    // ------------------------------------------------------------------ views

    /// @notice What `member` must send to `contribute()` right now.
    /// @return period The period that would be paid.
    /// @return amount Installment plus late fees, in wei.
    /// @return fees Late fees included in `amount`.
    /// @return payable_ False if the next period is in the future (nothing due yet).
    function amountDue(address member)
        external
        view
        returns (uint256 period, uint256 amount, uint256 fees, bool payable_)
    {
        Member storage m = _members[member];
        if (!m.active) revert NotAMember(member);
        period = m.nextPeriod;
        payable_ = period <= PeriodMath.periodOf(block.timestamp);
        fees = payable_ ? _lateFees(member, period, block.timestamp) : 0;
        amount = uint256(installment) + fees;
    }

    function memberOf(address account) external view returns (Member memory) {
        return _members[account];
    }

    /// @notice Length of the member list behind `membersPage` (everyone who ever joined).
    function memberListLength() external view returns (uint256) {
        return _memberList.length;
    }

    /// @notice Paginated member list for the app (bounded by `limit`).
    function membersPage(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        uint256 len = _memberList.length;
        if (offset >= len) return new address[](0);
        uint256 end = offset + limit > len ? len : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = _memberList[i];
        }
    }

    function isMember(address account) external view returns (bool) {
        return _members[account].active;
    }

    /// @notice A member's display name here ("" if not set yet).
    function nameOf(address member) external view returns (string memory) {
        return _names[member];
    }

    /// @notice The member currently using `displayName` (any letter case), or address(0).
    function memberByName(string calldata displayName) external view returns (address) {
        if (!DisplayName.isValid(displayName)) return address(0);
        bytes32 k = DisplayName.key(displayName);
        address holder = _nameOwner[k];
        // slither-disable-next-line incorrect-equality (0 means "in use"; a timestamp flag, not a balance)
        return _members[holder].active && _nameFreeAt[k] == 0 ? holder : address(0);
    }

    /// @notice True if `account` could take `displayName` right now.
    function isNameAvailable(string calldata displayName, address account)
        external
        view
        returns (bool)
    {
        return
            DisplayName.isValid(displayName) && _isNameFree(DisplayName.key(displayName), account);
    }

    function requestCount() external view returns (uint256) {
        return _requests.length;
    }

    function getRequest(uint256 id) external view returns (JoinRequest memory) {
        return _requests[id - 1];
    }

    function openRequestCount() external view returns (uint256) {
        return _openIds.length;
    }

    /// @notice Paginated open join requests (order changes as requests close).
    function openRequestsPage(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, JoinRequest[] memory page)
    {
        uint256 len = _openIds.length;
        if (offset >= len) return (new uint256[](0), new JoinRequest[](0));
        uint256 end = offset + limit > len ? len : offset + limit;
        ids = new uint256[](end - offset);
        page = new JoinRequest[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            ids[i - offset] = _openIds[i];
            page[i - offset] = _requests[_openIds[i] - 1];
        }
    }

    /// @notice True if `voter` can vote on request `id` right now.
    function canVote(uint256 id, address voter) external view returns (bool) {
        if (id == 0 || id > _requests.length) return false;
        JoinRequest storage r = _requests[id - 1];
        return r.status == JoinStatus.Open && block.timestamp <= r.deadline
            && _canVoteOn(r, _members[voter]) && !hasVoted[id][voter];
    }

    /// @notice Current value of `member`'s stake in wei.
    function stakeOf(address member) external view returns (uint256) {
        return SharesMath.assetsForShares(_members[member].shares, totalAssets, totalShares);
    }

    /// @notice NAV per 1e18 shares, for display.
    function navPerShareE18() external view returns (uint256) {
        return SharesMath.assetsForShares(1e18, totalAssets, totalShares);
    }

    function currentPeriod() external view returns (uint256) {
        return PeriodMath.periodOf(block.timestamp);
    }

    // ------------------------------------------------------------------ internals

    function _lateFees(address member, uint256 period, uint256 at) internal view returns (uint256) {
        return
            FeeMath.lateFees(
                period, holidayFor[member][period], at, dueDay, secondFeeDay, fee1, fee2
            );
    }

    /// @dev First period a new member owes: this month if its due moment hasn't passed,
    ///      otherwise next month, so nobody joins already late (ADR 0028, RT-09).
    function _firstPeriod(uint8 dueDay_) internal view returns (uint32) {
        uint256 current = PeriodMath.periodOf(block.timestamp);
        uint256 first =
            block.timestamp <= PeriodMath.dueMoment(current, dueDay_) ? current : current + 1;
        return SafeCast.toUint32(first);
    }

    /// @dev Fresh record every time; listed once even if the address rejoins later (RT-09).
    function _addMember(address who, uint32 firstPeriod) internal {
        uint32 seq = ++_seqCounter;
        _members[who] =
            Member({active: true, nextPeriod: firstPeriod, seq: seq, nameChangedAt: 0, shares: 0});
        memberCount += 1;
        if (!_listed[who]) {
            _listed[who] = true;
            _memberList.push(who);
        }
        emit MemberAdded(who, firstPeriod);
    }

    function _isFull() internal view returns (bool) {
        return maxMembers != 0 && memberCount >= maxMembers;
    }

    /// @dev Joined before the request and at most one period behind on installments (RT-03,
    ///      RT-07). A member still inside their first unpaid month is not behind.
    function _canVoteOn(JoinRequest storage r, Member storage m) internal view returns (bool) {
        if (!m.active || m.seq > r.seqSnapshot) return false;
        return
            uint256(m.nextPeriod) + MAX_PERIODS_BEHIND_TO_VOTE
                >= PeriodMath.periodOf(block.timestamp);
    }

    /// @dev Free if nobody ever held it, `account` held it last, or its reservation ran out.
    function _isNameFree(bytes32 k, address account) internal view returns (bool) {
        address holder = _nameOwner[k];
        if (holder == address(0) || holder == account) return true;
        uint64 freeAt = _nameFreeAt[k];
        return freeAt != 0 && block.timestamp >= freeAt;
    }

    /// @dev Moves `who` to `newKey`; their previous name stays reserved for them for the cooldown.
    function _takeName(address who, string memory displayName, bytes32 newKey) internal {
        string memory old = _names[who];
        if (bytes(old).length != 0) {
            bytes32 oldKey = DisplayName.key(old);
            if (oldKey != newKey) {
                _nameFreeAt[oldKey] = SafeCast.toUint64(block.timestamp) + NAME_COOLDOWN;
            }
        }
        _nameOwner[newKey] = who;
        _nameFreeAt[newKey] = 0;
        _names[who] = displayName;
        _members[who].nameChangedAt = SafeCast.toUint64(block.timestamp);
        emit DisplayNameSet(who, displayName);
    }

    function _openRequest(uint256 id) internal view returns (JoinRequest storage r) {
        if (id == 0 || id > _requests.length) revert RequestNotOpen(id);
        r = _requests[id - 1];
        if (r.status != JoinStatus.Open) revert RequestNotOpen(id);
    }

    /// @dev Open = not decided yet. Passes on quorum (of `eligible`) plus 66% yes of votes cast.
    ///      Decided early only when the remaining votes can't change the result.
    function _outcome(JoinRequest storage r, bool ended) internal view returns (JoinStatus) {
        // yes + no <= e: only members with seq <= seqSnapshot vote, and exactly `eligible`
        // active members had such a seq when the request was made. So `e - no` cannot underflow.
        uint256 e = r.eligible;
        uint256 yes = r.yes;
        uint256 no = r.no;
        uint256 cast = yes + no;
        bool quorum = cast * PERCENT >= uint256(quorumPct) * e;
        // Passes even if every remaining member votes no, and quorum is already met.
        if (quorum && yes * PERCENT >= ADMISSION_PASS_PCT * e) return JoinStatus.Approved;
        // Fails even if every remaining member votes yes.
        if ((e - no) * PERCENT < ADMISSION_PASS_PCT * e) return JoinStatus.Rejected;
        if (!ended) return JoinStatus.Open;
        if (!quorum) return JoinStatus.Expired;
        return
            yes * PERCENT >= ADMISSION_PASS_PCT * cast ? JoinStatus.Approved : JoinStatus.Rejected;
    }

    /// @dev Effects first; the only external call is the trusted factory registry, last.
    function _close(uint256 id, JoinRequest storage r, JoinStatus outcome) internal {
        address applicant = r.applicant;
        if (outcome == JoinStatus.Approved && _isFull()) outcome = JoinStatus.Full;
        r.status = outcome;
        delete openRequestOf[applicant];

        uint256 pos = _openPos[id];
        uint256 lastId = _openIds[_openIds.length - 1];
        _openIds[pos - 1] = lastId;
        _openPos[lastId] = pos;
        _openIds.pop();
        delete _openPos[id];
        emit JoinRequestClosed(id, outcome);

        if (outcome != JoinStatus.Approved) return;
        _addMember(applicant, _firstPeriod(dueDay));
        // Names aren't held while a vote runs, so check again (RT-06): never revert a passed vote.
        bytes32 k = DisplayName.key(r.displayName);
        if (_isNameFree(k, applicant)) _takeName(applicant, r.displayName, k);
        else emit DisplayNameUnavailable(applicant, r.displayName);
        ICircleRegistry(factory).registerMember(applicant);
    }

    // ------------------------------------------------------------------ no plain transfers

    receive() external payable {
        revert DirectTransferNotAllowed();
    }

    fallback() external payable {
        revert DirectTransferNotAllowed();
    }
}
