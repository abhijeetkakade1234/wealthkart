// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {PeriodMath} from "./libraries/PeriodMath.sol";
import {SharesMath} from "./libraries/SharesMath.sol";
import {FeeMath} from "./libraries/FeeMath.sol";

/// @title CircleVault
/// @notice One savings circle: members contribute a fixed AVAX installment each month and receive
///         non-transferable shares at the current NAV. Late fees go into the vault.
/// @dev Immutable (ADR 0020): no proxy, no upgrade path, no owner that can move funds.
///      All accounting is O(1) per action (ADR 0015) and uses internal bookkeeping, never
///      `address(this).balance` (ADR 0006). All times are UTC (ADR 0014).
///      This is the Phase 1 contribution slice; loans, votes, exits and membership changes follow.
contract CircleVault is ReentrancyGuard {
    // ------------------------------------------------------------------ types

    struct Config {
        /// @dev Circle name shown in the app, 1..48 bytes (public on-chain; no personal data).
        string name;
        /// @dev Fixed installment per period, in wei (ADR 0002).
        uint128 installment;
        /// @dev Late fee 1 (after the due day) and late fee 2 (after `secondFeeDay`), in wei.
        uint128 fee1;
        uint128 fee2;
        /// @dev Due day 1..28, 23:59:59 UTC (ADR 0014).
        uint8 dueDay;
        /// @dev Day after which fee 2 applies; dueDay < secondFeeDay <= 28.
        uint8 secondFeeDay;
        /// @dev Payment holidays allowed per member per UTC calendar year, 0..12 (ADR 0017).
        uint8 holidaysPerYear;
    }

    struct Member {
        bool active;
        /// @dev Next period this member must pay; payments are always oldest first.
        uint32 nextPeriod;
        uint128 shares;
    }

    // ------------------------------------------------------------------ constants

    uint256 public constant MAX_FOUNDERS = 200;
    /// @notice Avalanche C-Chain mainnet. This version has no withdrawal path yet (exits arrive in
    ///         Phase 2) and contracts are immutable, so deploying it on mainnet would lock funds.
    uint256 public constant AVALANCHE_MAINNET_CHAIN_ID = 43_114;
    uint8 public constant MAX_HOLIDAYS_PER_YEAR = 12;
    uint256 public constant MAX_NAME_BYTES = 48;

    // ------------------------------------------------------------------ immutable config

    uint128 public immutable installment;
    uint128 public immutable fee1;
    uint128 public immutable fee2;
    uint8 public immutable dueDay;
    uint8 public immutable secondFeeDay;
    uint8 public immutable holidaysPerYear;
    /// @notice First period members owe an installment for.
    uint32 public immutable startPeriod;
    address public immutable factory;

    // ------------------------------------------------------------------ state

    /// @notice Internally tracked assets in wei (cash + loans outstanding, once loans exist).
    uint256 public totalAssets;
    uint256 public totalShares;
    /// @notice Circle name (set once at creation).
    string public name;
    /// @dev Append-only member list for paginated reads; never iterated in write paths (ADR 0015).
    address[] internal _memberList;

    mapping(address member => Member) internal _members;
    mapping(address member => mapping(uint256 period => bool)) public holidayFor;
    mapping(address member => mapping(uint256 year => uint256)) public holidaysUsed;

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

    // ------------------------------------------------------------------ constructor

    constructor(Config memory cfg, address[] memory founders) {
        // Funds-stuck guard: no exits in this version (see AVALANCHE_MAINNET_CHAIN_ID).
        if (block.chainid == AVALANCHE_MAINNET_CHAIN_ID) revert MainnetNotSupported();
        uint256 nameLen = bytes(cfg.name).length;
        if (nameLen == 0 || nameLen > MAX_NAME_BYTES) {
            revert InvalidConfig("name must be 1..48 bytes");
        }
        if (cfg.installment == 0) revert InvalidConfig("installment must be > 0");
        if (cfg.dueDay < 1 || cfg.dueDay > 28) revert InvalidConfig("dueDay must be 1..28");
        if (cfg.secondFeeDay <= cfg.dueDay || cfg.secondFeeDay > 28) {
            revert InvalidConfig("secondFeeDay must be after dueDay and <= 28");
        }
        if (cfg.holidaysPerYear > MAX_HOLIDAYS_PER_YEAR) {
            revert InvalidConfig("holidaysPerYear must be <= 12");
        }
        if (founders.length == 0) revert InvalidConfig("at least one founder");
        // One-time, bounded loop at deployment only; no write path loops over members (ADR 0015).
        if (founders.length > MAX_FOUNDERS) revert TooManyFounders(founders.length);

        installment = cfg.installment;
        fee1 = cfg.fee1;
        fee2 = cfg.fee2;
        dueDay = cfg.dueDay;
        secondFeeDay = cfg.secondFeeDay;
        holidaysPerYear = cfg.holidaysPerYear;
        name = cfg.name;
        factory = msg.sender;

        uint32 start = SafeCast.toUint32(PeriodMath.periodOf(block.timestamp));
        startPeriod = start;

        // forge-lint: disable-next-line(require-revert-in-loop)
        for (uint256 i = 0; i < founders.length; ++i) {
            address f = founders[i];
            if (f == address(0)) revert ZeroAddressMember();
            if (_members[f].active) revert DuplicateMember(f);
            _members[f] = Member({active: true, nextPeriod: start, shares: 0});
            _memberList.push(f);
            emit MemberAdded(f, start);
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
        // the fee then raises NAV for everyone (ADR 0009).
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

    /// @notice Number of members ever added (members are never removed in this version).
    function memberCount() external view returns (uint256) {
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

    // ------------------------------------------------------------------ no plain transfers

    receive() external payable {
        revert DirectTransferNotAllowed();
    }

    fallback() external payable {
        revert DirectTransferNotAllowed();
    }
}
