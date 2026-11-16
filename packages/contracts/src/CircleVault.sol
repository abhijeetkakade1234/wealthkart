// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {PeriodMath} from "./libraries/PeriodMath.sol";
import {SharesMath} from "./libraries/SharesMath.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {CircleName} from "./libraries/CircleName.sol";
import {Membership} from "./modules/Membership.sol";
import {IReputation, IReputationSource} from "./interfaces/IReputation.sol";
import {Ledger} from "./modules/Ledger.sol";
import {Rules} from "./modules/Rules.sol";
import {Governance} from "./modules/Governance.sol";
import {Exits} from "./modules/Exits.sol";
import {LoanBook} from "./modules/LoanBook.sol";

/// @title CircleVault
/// @notice One savings circle: members contribute a fixed installment each month, in AVAX or the
///         factory's USDT (chosen once at creation, ADR 0046), and receive non-transferable
///         shares at the current NAV. Late fees go into the vault. Founders
///         named by the creator must accept; anyone else joins by a request and a member vote.
///         A member who stops paying can be voted dormant. Everyone picks a display name.
/// @dev Immutable (ADR 0020): no proxy, no upgrade path, no owner that can move funds.
///      Membership logic lives in the linked `Membership` library (ADR 0031); its events and
///      errors are part of this contract's ABI (the SDK merges them in).
///      All accounting is O(1) per action (ADR 0015) and uses internal bookkeeping, never
///      `address(this).balance` (ADR 0006). All times are UTC (ADR 0014).
///      Membership: ADR 0028. Display names: ADR 0029. Fee caps: ADR 0030. Dormant: ADR 0032.
///      Loans, exits and governance follow in Phase 2. Review fixes: ADR 0043. The reentrancy
///      lock lives in transient storage (GOV-05), so no storage slot is used for it and a
///      skipped modifier epilogue can never outlive the transaction.
// slither-disable-next-line missing-inheritance (ILoanBookViews only documents the forwarded outputs)
contract CircleVault is ReentrancyGuardTransient {
    using Membership for Membership.Store;
    using Ledger for Ledger.Store;
    using LoanBook for LoanBook.Store;

    // ------------------------------------------------------------------ types

    /// @notice The money a circle holds (ADR 0046). Chosen once at creation, never changed.
    enum Asset {
        AVAX,
        USDT
    }

    struct Config {
        /// @dev Circle name shown in the app: 3..48 safe characters, no links (ADR 0033, RT-26).
        ///      Public on-chain; no personal data.
        string name;
        /// @dev AVAX, or the factory's USDT (reverts if the factory has none). Every amount below
        ///      is in the asset's smallest unit: wei, or 1e-6 USDT (ADR 0046).
        Asset asset;
        /// @dev Fixed installment per period, in the asset's smallest unit (ADR 0002).
        uint128 installment;
        /// @dev Late fee 1 (after the due day) and late fee 2 (after `secondFeeDay`).
        ///      Each is at most half the installment (ADR 0030).
        uint128 fee1;
        uint128 fee2;
        /// @dev Due day 1..28, 23:59:59 UTC (ADR 0014).
        uint8 dueDay;
        /// @dev Day after which fee 2 applies; dueDay < secondFeeDay <= 28.
        uint8 secondFeeDay;
        /// @dev Payment holidays allowed per member per UTC calendar year, 0..12 (ADR 0017).
        uint8 holidaysPerYear;
        /// @dev How long a vote stays open, in seconds: 1 hour..14 days (ADR 0022).
        uint32 votingWindow;
        /// @dev Share of eligible members who must vote, in percent: 20..100 (ADR 0022).
        uint8 quorumPct;
        /// @dev Member cap, 3..50 and at least the creator plus invited founders (ADR 0045).
        uint16 maxMembers;
        /// @dev Missed installments before a dormant vote is allowed, 1..12 (ADR 0032).
        uint8 dormantAfter;
        /// @dev Installments a member admitted by vote must pay before voting, 0..6 (ADR 0033).
        uint8 minPaidToVote;
        /// @dev Loan, exit and governance settings a vote can change later (ADR 0037).
        Rules.Params rules;
    }

    // ------------------------------------------------------------------ constants

    uint256 public constant MAX_FOUNDERS = Membership.MAX_FOUNDERS;
    uint8 public constant MAX_HOLIDAYS_PER_YEAR = 12;
    uint256 public constant MAX_NAME_BYTES = CircleName.MAX_BYTES;
    uint32 public constant MIN_VOTING_WINDOW = 1 hours;
    uint32 public constant MAX_VOTING_WINDOW = 14 days;
    uint8 public constant MIN_QUORUM_PCT = 20;
    uint8 public constant MAX_QUORUM_PCT = 100;
    uint16 public constant MIN_MAX_MEMBERS = 3;
    /// @notice Highest member cap a circle can choose (ADR 0045).
    uint16 public constant MAX_MAX_MEMBERS = 50;
    uint8 public constant MAX_DORMANT_AFTER = 12;
    uint8 public constant MAX_MIN_PAID_TO_VOTE = 6;
    uint256 public constant MAX_OPEN_PER_MEMBER = Membership.MAX_OPEN_PER_MEMBER;
    uint256 public constant ADMISSION_PASS_PCT = Membership.ADMISSION_PASS_PCT;
    uint256 public constant DORMANT_PASS_PCT = Membership.DORMANT_PASS_PCT;
    uint256 public constant MAX_OPEN_REQUESTS = Membership.MAX_OPEN_REQUESTS;
    uint64 public constant FOUNDER_INVITE_TTL = Membership.FOUNDER_INVITE_TTL;
    uint64 public constant NAME_COOLDOWN = Membership.NAME_COOLDOWN;
    uint256 public constant MAX_PERIODS_BEHIND_TO_VOTE = Membership.MAX_PERIODS_BEHIND_TO_VOTE;

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
    uint8 public immutable dormantAfter;
    uint8 public immutable minPaidToVote;
    /// @notice First period the creator owes an installment for.
    uint32 public immutable startPeriod;
    /// @notice Block the circle was created in: where the app starts reading its events.
    uint64 public immutable createdAtBlock;
    address public immutable factory;
    /// @notice The soulbound record this circle writes payments and loan outcomes to (ADR 0042).
    address public immutable reputation;
    address public immutable creator;
    /// @notice The circle's token: address(0) = AVAX, otherwise the factory's USDT (ADR 0046).
    address public immutable asset;

    // ------------------------------------------------------------------ state

    /// @notice Circle name (set once at creation).
    string public name;
    Membership.Store internal _m;
    /// @dev Assets, shares, loans out and refused payouts, shared by every module (ADR 0037).
    Ledger.Store internal _ledger;
    /// @dev Current rules; Governance changes them after the delay (ADR 0019). Writes call
    ///      `_syncRules` first and views read `_effRules`, so a due change is always in force.
    Rules.Params internal _rules;
    /// @dev Circle proposals: rule changes, fee waivers, dissolution, guardian off (ADR 0040).
    // slither-disable-next-line uninitialized-state (written by the library through its slot)
    Governance.Store internal _gov;
    /// @dev Exit queue and guardian pause bookkeeping (ADR 0039).
    Exits.Store internal _exits;
    /// @dev Loan requests, loans, guarantees and settle votes (LoanBook, ADR 0038).
    LoanBook.Store internal _loans;

    // ------------------------------------------------------------------ events

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
    error AdvancePaymentNotAllowed(uint256 period, uint256 currentPeriod);
    error WrongAmount(uint256 expected, uint256 sent);
    error HolidayTooLate(uint256 period);
    error HolidayAlreadyDeclared(uint256 period);
    error HolidayLimitReached(uint256 year);
    error PeriodAlreadyPaid(uint256 period);
    error DirectTransferNotAllowed();
    /// @notice This factory has no USDT on this chain, so only AVAX circles can be created.
    error UsdtNotAvailable();

    // ------------------------------------------------------------------ constructor

    /// @param cfg Circle settings (bounds per ADR 0022 / 0030 / 0032).
    /// @param creator_ The wallet creating the circle; the only member at the start.
    /// @param invitees Other founders; each must call `acceptInvite` within 14 days (RT-02).
    constructor(Config memory cfg, address creator_, address[] memory invitees) {
        if (creator_ == address(0)) revert Membership.ZeroAddressMember();
        _validate(cfg, invitees.length);
        Rules.validate(cfg.rules, cfg.installment);
        _rules = cfg.rules;

        installment = cfg.installment;
        fee1 = cfg.fee1;
        fee2 = cfg.fee2;
        dueDay = cfg.dueDay;
        secondFeeDay = cfg.secondFeeDay;
        holidaysPerYear = cfg.holidaysPerYear;
        votingWindow = cfg.votingWindow;
        quorumPct = cfg.quorumPct;
        maxMembers = cfg.maxMembers;
        dormantAfter = cfg.dormantAfter;
        minPaidToVote = cfg.minPaidToVote;
        name = cfg.name;
        factory = msg.sender;
        reputation = IReputationSource(msg.sender).reputation();
        address token = address(0);
        if (cfg.asset == Asset.USDT) {
            token = IReputationSource(msg.sender).usdt();
            if (token == address(0)) revert UsdtNotAvailable();
        }
        asset = token;
        _ledger.token = token;
        creator = creator_;
        createdAtBlock = SafeCast.toUint64(block.number);

        // Immutables can't be read during construction, so build the params from `cfg`.
        startPeriod = _m.init(
            Membership.Params({
                factory: msg.sender,
                dueDay: cfg.dueDay,
                votingWindow: cfg.votingWindow,
                quorumPct: cfg.quorumPct,
                maxMembers: cfg.maxMembers,
                dormantAfter: cfg.dormantAfter,
                minPaidToVote: cfg.minPaidToVote
            }),
            creator_,
            invitees
        );
    }

    // slither-disable-start incorrect-return,redundant-statements
    // Intended, not a bug: `_govForward(sel, true)` ends the call with the Governance library's
    // return data (see the GOVERNANCE section). `_syncRules` uses `ret = false`, which returns
    // normally, but Slither can't tell the two paths apart and flags every write that syncs.

    // ------------------------------------------------------------------ contributions

    /// @notice Pay the oldest unpaid installment, plus any late fees owed on it.
    ///         A dormant member who pays is woken first and pays the current period (RT-11).
    /// @dev AVAX: `msg.value` must equal exactly `installment + lateFees` (see `amountDue`).
    ///      USDT: send no AVAX; approve the vault for that amount first and it is pulled.
    function contribute() external payable nonReentrant {
        if (_ledger.dissolved) revert Governance.CircleDissolved();
        _syncRules();
        Membership.Member storage m = _m.members[msg.sender];
        if (!m.active) revert Membership.NotAMember(msg.sender);
        if (m.dormant) Exits.wake(_exits, _ledger, _m, dueDay, Exits.WakeMode.Pay);

        uint256 period = m.nextPeriod;
        uint256 current = PeriodMath.periodOf(block.timestamp);
        if (period > current) revert AdvancePaymentNotAllowed(period, current);

        uint256 fees = _lateFees(msg.sender, period, block.timestamp);
        uint256 expected = uint256(installment) + fees;
        bool token = asset != address(0);
        if (token ? msg.value != 0 : msg.value != expected) {
            if (token) revert Ledger.AvaxNotAccepted();
            revert WrongAmount(expected, msg.value);
        }

        // Effects: shares are priced on the installment at the pre-payment NAV;
        // the fee then raises NAV for everyone (ADR 0009). A late joiner buys in here,
        // at today's NAV, so existing members are not diluted (ADR 0006).
        uint256 minted =
            SharesMath.sharesForDeposit(installment, _ledger.totalAssets, _ledger.totalShares);
        _ledger.totalAssets += expected;
        _ledger.totalShares += minted;
        m.shares += SafeCast.toUint128(minted);
        m.nextPeriod = SafeCast.toUint32(period + 1);
        Membership.recordPayment(_m, msg.sender, minPaidToVote);

        emit Contributed(msg.sender, period, installment, fees, minted);
        // Last: the trusted record from our own factory (ADR 0042). On time = no late fee.
        // slither-disable-next-line incorrect-equality (fees is a computed amount, not a balance)
        IReputation(reputation).recordPayment(msg.sender, fees == 0);
        if (token) _ledger.pull(expected);
    }

    /// @notice Declare a payment holiday for the current period (ADR 0017): no late fees until
    ///         the next period's due date. The installment is still owed.
    function declareHoliday() external {
        Membership.Member storage m = _activeMember(msg.sender);

        uint256 period = PeriodMath.periodOf(block.timestamp);
        if (m.nextPeriod > period) revert PeriodAlreadyPaid(period);
        if (block.timestamp > PeriodMath.dueMoment(period, dueDay)) revert HolidayTooLate(period);
        if (_m.holidayFor[msg.sender][period]) revert HolidayAlreadyDeclared(period);

        uint256 year = period / 12;
        if (_m.holidaysUsed[msg.sender][year] >= holidaysPerYear) revert HolidayLimitReached(year);

        _m.holidayFor[msg.sender][period] = true;
        _m.holidaysUsed[msg.sender][year] += 1;
        emit HolidayDeclared(msg.sender, period);
    }

    // ------------------------------------------------------------------ membership

    /// @notice Accept the creator's invitation to be a founder. Only now do you count as a
    ///         member, in quorum and in your portfolio (RT-02).
    function acceptInvite() external nonReentrant {
        _m.acceptInvite(_params());
    }

    /// @notice Turn down a founder invitation.
    function declineInvite() external {
        _m.declineInvite();
    }

    /// @notice Ask to join. The invite link is just this circle's address; the member vote is
    ///         the gate (ADR 0028).
    /// @param displayName The name you want here; checked now and again when you're admitted.
    /// @param invitedBy A member who invited you, shown to voters, or address(0).
    /// @return id The request id.
    function requestToJoin(string calldata displayName, address invitedBy)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (_ledger.paused()) revert Exits.CirclePaused(_ledger.pausedUntil);
        return _m.requestToJoin(_params(), displayName, invitedBy);
    }

    /// @notice Ask the circle to mark `member` dormant once they have missed `dormantAfter`
    ///         installments (ADR 0032). Your yes vote is counted.
    /// @return id The request id.
    function proposeDormant(address member) external nonReentrant returns (uint256 id) {
        return _m.proposeDormant(_params(), member);
    }

    /// @notice Vote on an open request (join, dormant or nominee claim). Only members who were
    ///         in the circle before the request and are at most one installment behind can vote.
    ///         The vote that decides the outcome settles it.
    function vote(uint256 id, bool support) external nonReentrant {
        _afterVote(_m.vote(_params(), id, support));
    }

    /// @notice Settle a request once the outcome is certain or the voting window has ended.
    ///         Anyone can call this.
    function finalize(uint256 id) external nonReentrant {
        _afterVote(_m.finalize(_params(), id));
    }

    /// @dev A closed nominee claim (ADR 0056): queue the exit on a pass, under today's rules.
    function _afterVote(uint256 claim) internal {
        if (claim == 0) return;
        _syncRules();
        Exits.closeClaim(_exits, _m, _rules, claim);
    }

    /// @notice Withdraw your own open join request.
    function cancelJoinRequest() external nonReentrant {
        _m.cancelJoinRequest(_params());
    }

    /// @notice Come back from dormant. Dues restart from this month (or next, if this month's
    ///         due moment has passed); your shares never left (ADR 0032). Ends any nominee claim
    ///         about you (ADR 0056).
    function wake() external nonReentrant {
        Exits.wake(_exits, _ledger, _m, dueDay, Exits.WakeMode.Wake);
    }

    /// @notice Set or change your display name in this circle (ADR 0029). The first name is
    ///         free to set; after that, one change per `NAME_COOLDOWN`, and your old name stays
    ///         reserved for you for the same time.
    function setDisplayName(string calldata displayName) external {
        _m.setDisplayName(displayName);
    }

    // ------------------------------------------------------------------ payouts

    /// @notice Claim a payout your wallet refused (or couldn't receive) earlier (RT-20).
    function withdraw() external nonReentrant {
        _ledger.withdraw(msg.sender);
    }

    // ================================================================== LOANS (LoanBook)
    // Phase 2 module: loan request -> vote -> disbursal, interest, repayment, tenors, default.
    // Entry points for the LoanBook library go in this section only (ADR 0037).

    /// @notice Ask the circle for a loan (ADR 0007, 0038). You must be able to vote, not be
    ///         frozen, and have no loan or open request. The amount must fit the fund cap, k x
    ///         (your stake + your guarantor's stake) and lendable cash after the reserve. The
    ///         guarantor (or address(0)) must accept with `acceptGuarantee` before it can pass.
    /// @return id The loan request id.
    function requestLoan(uint256 amount, bool medical, address guarantor)
        external
        nonReentrant
        returns (uint256 id)
    {
        _syncRules();
        return _loans.requestLoan(_m, _ledger, _rules, _loanCtx(), amount, medical, guarantor);
    }

    /// @notice Agree to guarantee `borrower`'s open loan request. You can't exit until the loan
    ///         is repaid or settled, and your shares are at risk if it defaults.
    function acceptGuarantee(address borrower) external nonReentrant {
        _syncRules();
        _loans.acceptGuarantee(_m, _ledger, _rules, _loanCtx(), borrower);
    }

    /// @notice Vote on a loan or settle request. A loan that passes is paid out in this call.
    function voteLoan(uint256 id, bool support) external nonReentrant {
        _syncRules();
        _loans.vote(_m, _ledger, _rules, _loanCtx(), id, support);
    }

    /// @notice Settle a loan or settle request once decided or its window ended. Anyone can call.
    function finalizeLoan(uint256 id) external nonReentrant {
        _syncRules();
        _loans.finalize(_m, _ledger, _rules, _loanCtx(), id);
    }

    /// @notice Withdraw your own open loan request.
    function cancelLoanRequest() external nonReentrant {
        _loans.cancel(_m);
    }

    /// @notice Pay all interest and late fees owed on your loan (see `interestDue`), exactly.
    ///         Rates, fees and the default limit are the loan's own, fixed at payout. USDT
    ///         circles: send no AVAX; approve the amount first.
    function payInterest() external payable nonReentrant {
        _loans.payInterest(_m, _ledger, _loanCtx(), msg.value);
    }

    /// @notice Repay principal with the AVAX sent (AVAX circles). Closing the loan needs interest
    ///         paid first and may add one month's interest (rule 17): send `payoffDue` to close it.
    function repay() external payable nonReentrant {
        _repay(msg.value);
    }

    /// @notice Repay `amount` of principal (see `repay()`). AVAX circles: send exactly `amount`.
    ///         USDT circles: send no AVAX; approve `amount` first and it is pulled (ADR 0046).
    function repay(uint256 amount) external payable nonReentrant {
        _repay(amount);
    }

    function _repay(uint256 amount) internal {
        _syncRules();
        _loans.repay(_m, _ledger, _rules, _loanCtx(), amount, msg.value);
    }

    /// @notice Mark a loan in default once it qualifies; freezes borrower and guarantor.
    function markDefault(address borrower) external nonReentrant {
        _loans.markDefault(_m, _loanCtx(), borrower);
    }

    /// @notice Propose using a defaulted borrower's shares (then the guarantor's) to repay.
    /// @return id The settle request id.
    function proposeSettle(address borrower) external nonReentrant returns (uint256 id) {
        _syncRules();
        return _loans.proposeSettle(_m, _ledger, _rules, _loanCtx(), borrower);
    }

    // ---- loan views. Each forwards a LoanBook view's raw output (see `_loanView`). The three
    // that return structs declare no return type here to save code size; their real return
    // types are in `ILoanBookViews`, and the SDK ABI carries them (ADR 0038).

    /// @notice `borrower`'s loan (principal 0 = no loan). Returns `LoanBook.Loan`.
    function loanOf(address borrower) external view {
        _view(address(LoanBook), LoanBook.loanOf.selector, _loansSlot(), false);
        borrower;
    }

    /// @notice What `payInterest` needs now: interest, late fees, and overdue months.
    function interestDue(address borrower)
        external
        view
        returns (uint256 interest, uint256 fees, uint256 overdueMonths)
    {
        _loanView(
            abi.encodeWithSelector(
                LoanBook.interestDue.selector, _loansSlot(), _rulesSlot(), _loanCtx(), borrower
            )
        );
    }

    /// @notice What `repay` needs to close the loan now (after interest is paid).
    function payoffDue(address borrower) external view returns (uint256) {
        _loanView(
            abi.encodeWithSelector(
                LoanBook.payoffDue.selector, _loansSlot(), _rulesSlot(), borrower
            )
        );
    }

    /// @notice Loan or settle request `id`. Returns `LoanBook.Request`.
    function loanRequest(uint256 id) external view {
        _view(address(LoanBook), LoanBook.loanRequest.selector, _loansSlot(), false);
        id;
    }

    function loanRequestCount() external view returns (uint256) {
        return _loans.requests.length;
    }

    /// @notice `borrower`'s open loan request id, or 0.
    function pendingLoanOf(address borrower) external view returns (uint256) {
        return _loans.pendingOf[borrower];
    }

    /// @notice Paginated open loan and settle requests (order changes as requests close).
    ///         Returns `(uint256[] ids, LoanBook.Request[] page)`.
    function openLoanRequestsPage(uint256 offset, uint256 limit) external view {
        _view(address(LoanBook), LoanBook.openPage.selector, _loansSlot(), false);
        (offset, limit);
    }

    function canVoteLoan(uint256 id, address voter) external view returns (bool) {
        return _loans.canVote(_m, id, voter);
    }

    /// @notice Cash that can be lent right now (cash minus the reserve, rule 12).
    function lendableCash() external view returns (uint256) {
        return LoanBook.lendableCash(_ledger, _effRules());
    }

    function _loanCtx() internal view returns (LoanBook.Ctx memory) {
        address head = _exits.first;
        return LoanBook.Ctx({
            dueDay: dueDay,
            votingWindow: votingWindow,
            quorumPct: quorumPct,
            reputation: reputation,
            exitDue: head != address(0) && block.timestamp >= _exits.entries[head].maturesAt
        });
    }

    function _loansSlot() internal pure returns (uint256 slot) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            slot := _loans.slot
        }
    }

    /// @dev Slot of the rules in force right now (see `_effRules`).
    function _rulesSlot() internal view returns (uint256 slot) {
        Rules.Params storage r = _effRules();
        // solhint-disable-next-line no-inline-assembly
        assembly {
            slot := r.slot
        }
    }

    /// @dev Runs a LoanBook view with DELEGATECALL and returns its ABI output unchanged as the
    ///      calling function's output. The vault then never decodes and re-encodes the big loan
    ///      structs, which saves about 2 KB of runtime code (ADR 0038). The library is linked at
    ///      build time and the selector and arguments are fixed by the caller, so nothing here is
    ///      user-controlled. The view cast is sound: the target is a `view` library function, and
    ///      in an `eth_call`/STATICCALL context any write would revert anyway.
    function _loanView(bytes memory data) internal view {
        function(bytes memory) internal fwd = _delegateLoanBook;
        function(bytes memory) internal view asView;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            asView := fwd
        }
        asView(data);
    }

    /// @dev Never returns to its caller: ends the call with the library's output or revert.
    ///      Only reached through the view cast in `_loanView`.
    // slither-disable-next-line dead-code (called through a function pointer in _loanView)
    function _delegateLoanBook(bytes memory data) internal {
        // solhint-disable avoid-low-level-calls
        // slither-disable-next-line low-level-calls,controlled-delegatecall (fixed linked library, fixed selector)
        (bool ok, bytes memory ret) = address(LoanBook).delegatecall(data);
        // solhint-enable avoid-low-level-calls
        // solhint-disable-next-line no-inline-assembly
        assembly {
            if iszero(ok) { revert(add(ret, 32), mload(ret)) }
            return(add(ret, 32), mload(ret))
        }
    }

    function _exitsSlot() internal pure returns (uint256 slot) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            slot := _exits.slot
        }
    }

    /// @dev `_view` on the Membership library with the members store.
    function _mView(bytes4 sel, bool dyn) internal view {
        uint256 slot;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            slot := _m.slot
        }
        _view(address(Membership), sel, slot, dyn);
    }

    /// @dev Runs view `sel` of the linked library `lib` with DELEGATECALL, passing the storage
    ///      slot `slot` first and then this call's own arguments, and ends the call with the
    ///      library's output (or revert) unchanged. The vault then never decodes or re-encodes
    ///      the library's structs, arrays and strings, which keeps it small (ADR 0038). `dyn`:
    ///      the first argument is a string, so its offset moves by the one word the slot adds.
    ///      `lib` and `sel` are fixed by the caller; nothing here is user-controlled. The view
    ///      cast is sound for the same reason as `_loanView`: the targets are view functions.
    function _view(address lib, bytes4 sel, uint256 slot, bool dyn) internal view {
        function(address, bytes4, uint256, bool) internal fwd = _forward;
        function(address, bytes4, uint256, bool) internal view asView;
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            asView := fwd
        }
        asView(lib, sel, slot, dyn);
    }

    /// @dev Never returns to its caller. Only reached through the view cast in `_view`.
    // slither-disable-next-line dead-code (called through a function pointer in _view)
    function _forward(address lib, bytes4 sel, uint256 slot, bool dyn) internal {
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            if iszero(extcodesize(lib)) { revert(0, 0) }
            let ptr := mload(0x40)
            mstore(ptr, sel)
            mstore(add(ptr, 0x04), slot)
            let n := sub(calldatasize(), 4)
            calldatacopy(add(ptr, 0x24), 4, n)
            if dyn { mstore(add(ptr, 0x24), add(mload(add(ptr, 0x24)), 0x20)) }
            let ok := delegatecall(gas(), lib, ptr, add(0x24, n), 0, 0)
            returndatacopy(ptr, 0, returndatasize())
            if iszero(ok) { revert(ptr, returndatasize()) }
            return(ptr, returndatasize())
        }
    }

    // ================================================================== end LOANS

    // ================================================================== EXITS (Exits)
    // Phase 2 module: exit notice -> NAV snapshot -> payout, Chainlink Automation, guardian pause.
    // Entry points for the Exits library go in this section only (ADR 0037).

    /// @notice Ask to leave. You are paid your shares at NAV once the notice ends, minus the
    ///         exit fee. While a rule change waits, the notice ends no later than the moment the
    ///         new rules apply (ADR 0043). Not while frozen or tied to a loan, nor once dissolved.
    ///         While you wait you can't vote, propose, borrow or guarantee.
    function requestExit() external nonReentrant {
        _syncRules();
        Exits.requestExit(_exits, _ledger, _m, _rules);
    }

    /// @notice Withdraw your exit request before it is paid.
    function cancelExit() external nonReentrant {
        Exits.cancelExit(_exits, _ledger, _m);
    }

    /// @notice Collect your own exit after the notice (works even if automation is down). Exits
    ///         ahead of you whose notice has ended are settled first (first come, first served).
    /// @return paid False if an exit ahead of you is waiting for cash; you keep your place.
    function claimExit() external nonReentrant returns (bool paid) {
        _syncRules();
        return Exits.claimExit(_exits, _ledger, _m, _rules);
    }

    /// @notice Pay matured exits in order, looking at up to `maxCount` exits from the front.
    ///         Anyone can call it; never blocked by the guardian pause.
    function processExits(uint256 maxCount) external nonReentrant returns (uint256 paid) {
        _syncRules();
        return Exits.processExits(_exits, _ledger, _m, _rules, maxCount);
    }

    /// @notice Chainlink Automation check (AutomationCompatibleInterface).
    function checkUpkeep(bytes calldata)
        external
        view
        returns (bool upkeepNeeded, bytes memory performData)
    {
        return (Exits.upkeepNeeded(_exits, _ledger, _m, _effRules()), "");
    }

    /// @notice Chainlink Automation action: process one batch of the exit queue.
    function performUpkeep(bytes calldata) external nonReentrant {
        _syncRules();
        // slither-disable-next-line unused-return (the count is only for direct callers)
        Exits.processExits(_exits, _ledger, _m, _rules, Exits.UPKEEP_BATCH);
    }

    /// @notice Guardian (the creator): pause new loans and joins for 14 days, once per 90 days.
    function pause() external {
        Exits.pause(_exits, _ledger, _m, creator);
    }

    /// @notice End the pause early (the guardian, or anyone once the guardian is gone).
    function unpause() external {
        Exits.unpause(_ledger, _m, creator);
    }

    /// @notice After a dissolve vote, take your share of the circle's cash now. While loans are
    ///         out you keep the rest of your shares and claim again as they are repaid; once none
    ///         are out you take the rest and leave. A refused payout waits for `withdraw`.
    function claimDissolution() external nonReentrant {
        Exits.claimDissolution(_exits, _ledger, _m);
    }

    /// @notice `member`'s pending exit (`requestedAt` 0 = none); `prev`/`next` link the queue.
    function exitOf(address member) external view returns (Exits.Entry memory e) {
        _view(address(Exits), Exits.entryOf.selector, _exitsSlot(), false);
        (member, e);
    }

    /// @notice Exits in the queue right now.
    function exitQueueLength() external view returns (uint256) {
        return _exits.length;
    }

    /// @notice Paginated exit queue in payout order.
    function exitQueuePage(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        _view(address(Exits), Exits.queuePage.selector, _exitsSlot(), false);
        (offset, limit, page);
    }

    /// @notice What `member` would be paid right now, after the exit fee (none once dissolved).
    function exitValue(address member) external view returns (uint256) {
        return Exits.exitValue(_exits, _ledger, _m, _effRules(), member);
    }

    /// @notice Start of the guardian's last pause (0 = never); the next is allowed 90 days later.
    function lastPauseAt() external view returns (uint64) {
        return _exits.lastPauseAt;
    }

    /// @notice Exits whose notice ended and that wait for cash; no new loans while > 0.
    function exitsWaiting() external view returns (uint256) {
        return _ledger.exitsWaiting;
    }

    /// @notice End of the guardian pause (in the past = not paused).
    function pausedUntil() external view returns (uint64) {
        return _ledger.pausedUntil;
    }

    // ---- nominee (ADR 0016, 0056): a backup wallet that can claim a dormant member's share.

    /// @notice Name your backup wallet, or clear it with address(0). It can ask for your share
    ///         only once you are dormant, and only the circle's vote lets it through. Changing it
    ///         while a claim about you runs ends that claim and brings you back from dormant.
    function setNominee(address nominee) external nonReentrant {
        Exits.setNominee(_exits, _ledger, _m, dueDay, nominee);
    }

    /// @notice As `member`'s nominee, ask the circle for their share (they must be dormant).
    ///         On a yes vote their exit is queued with the usual notice and paid to you.
    /// @return id The request id; it is voted with `vote` like join and dormant requests.
    function requestNomineeClaim(address member) external nonReentrant returns (uint256 id) {
        return Exits.requestClaim(_exits, _ledger, _m, _params(), member);
    }

    /// @notice End a nominee claim about you, before or after the vote, until it is paid. It
    ///         also brings you back from dormant: dues restart as with `wake`.
    function cancelNomineeClaim() external nonReentrant {
        Exits.wake(_exits, _ledger, _m, dueDay, Exits.WakeMode.CancelClaim);
    }

    /// @notice `member`'s backup wallet (address(0) = none).
    function nomineeOf(address member) external view returns (address) {
        return _exits.nominee[member];
    }

    /// @notice A nominee claim about `member`: `requestId` while the vote runs (0 = none), and
    ///         `payTo` once it passed and the exit is queued (see `exitOf` for when it matures).
    function nomineeClaimOf(address member)
        external
        view
        returns (uint256 requestId, address payTo)
    {
        return (_exits.claimId[member], _exits.payTo[member]);
    }

    // ================================================================== end EXITS

    // ================================================================== GOVERNANCE (Governance)
    // Phase 2 module: rule changes with delay and rage-quit, fee waivers, dissolution.
    // Entry points for the Governance library go in this section only (ADR 0037, 0040).

    // Each entry point forwards its own calldata to the library function with the same
    // arguments (`_govForward`); the library does the work and its return data is passed back
    // as is. This keeps the vault small (ADR 0040). The bare names in these bodies only mark
    // parameters and return values as used: the values travel in calldata and return data.

    /// @notice Propose new rules (within the bounds of `Rules.validate`). If it passes, it
    ///         applies after the delay, from the next period; until then members may exit with
    ///         no notice (ADR 0019). Your yes vote is counted.
    function proposeRuleChange(Rules.Params calldata newRules) external returns (uint256 id) {
        _govForward(Governance.proposeRuleChange.selector, true);
        (newRules, id);
    }

    /// @notice Ask the circle to waive the late fees on `member`'s unpaid installment for
    ///         `period`, with a fixed reason. `member` may ask for themselves but can't vote.
    function proposeFeeWaiver(address member, uint256 period, Governance.Reason reason)
        external
        returns (uint256 id)
    {
        _govForward(Governance.proposeFeeWaiver.selector, true);
        (member, period, reason, id);
    }

    /// @notice Propose dissolving the circle (ADR 0021), at the dissolve pass mark.
    function proposeDissolve() external returns (uint256 id) {
        _govForward(Governance.proposeDissolve.selector, true);
        id;
    }

    /// @notice Propose removing the guardian's pause power for good (ADR 0020).
    function proposeGuardianOff() external returns (uint256 id) {
        _govForward(Governance.proposeGuardianOff.selector, true);
        id;
    }

    /// @notice Vote on an open circle proposal; the deciding vote settles it.
    function voteProposal(uint256 id, bool support) external {
        _govForward(Governance.vote.selector, true);
        (id, support);
    }

    /// @notice Settle a proposal once its outcome is certain or its window ended. Anyone.
    function finalizeProposal(uint256 id) external {
        _govForward(Governance.finalize.selector, true);
        id;
    }

    /// @notice Withdraw your own open proposal.
    function cancelProposal(uint256 id) external {
        _govForward(Governance.cancel.selector, true);
        id;
    }

    /// @notice Put a passed rule change into force once its time has come. Anyone.
    function applyRuleChange() external {
        _govForward(Governance.applyRuleChange.selector, true);
    }

    function proposal(uint256 id) external view returns (Governance.Proposal memory p) {
        _govView(Governance.proposal.selector);
        (id, p);
    }

    /// @notice The rules a rule-change proposal asks for.
    function proposalRules(uint256 id) external view returns (Rules.Params memory r) {
        _govView(Governance.proposalRules.selector);
        (id, r);
    }

    /// @notice A passed rule change waiting to apply; `effectiveAt` 0 means none.
    function pendingRuleChange()
        external
        view
        returns (Rules.Params memory rules_, uint64 effectiveAt)
    {
        _govView(Governance.pendingRuleChange.selector);
        (rules_, effectiveAt);
    }

    /// @notice Paginated open proposals (order changes as proposals close).
    function openProposalsPage(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, Governance.Proposal[] memory page)
    {
        _govView(Governance.openPage.selector);
        (offset, limit, ids, page);
    }

    function canVoteProposal(uint256 id, address voter) external view returns (bool ok) {
        _govView(Governance.canVote.selector);
        (id, voter, ok);
    }

    function hasVotedProposal(uint256 id, address voter) external view returns (bool ok) {
        _govView(Governance.hasVotedOn.selector);
        (id, voter, ok);
    }

    function proposalCount() external view returns (uint256) {
        return _gov.proposals.length;
    }

    /// @notice While a rule change waits, exits requested now mature by this time at the latest.
    function rageQuitUntil() external view returns (uint64) {
        return _ledger.rageQuitUntil;
    }

    function dissolved() external view returns (bool) {
        return _ledger.dissolved;
    }

    function guardianDisabled() external view returns (bool) {
        return _ledger.guardianDisabled;
    }

    /// @dev Delegatecalls the Governance library function `sel` with the vault's storage slots
    ///      and settings first, then this call's own arguments (all static, so the encoding
    ///      matches; extra trailing bytes are ignored). Reverts are passed on unchanged. With
    ///      `ret`, the library's return data is returned straight to the caller and this call
    ///      ends here; such calls are refused inside another nonReentrant call (a payout
    ///      callback), and they never set the lock, so nothing can leave it set (GOV-05).
    ///      NEVER add modifiers to the forwarded entry points: the assembly `return` skips them.
    function _govForward(bytes4 sel, bool ret) internal {
        if (ret && _reentrancyGuardEntered()) revert ReentrancyGuardReentrantCall();
        address lib = address(Governance);
        uint256 inst = installment;
        uint256 window = votingWindow;
        uint256 quorum = quorumPct;
        // Raw forward keeps the vault small (see the section comment).
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            if iszero(extcodesize(lib)) { revert(0, 0) }
            let ptr := mload(0x40)
            mstore(ptr, sel)
            mstore(add(ptr, 0x04), _gov.slot)
            mstore(add(ptr, 0x24), _m.slot)
            mstore(add(ptr, 0x44), _ledger.slot)
            mstore(add(ptr, 0x64), _rules.slot)
            mstore(add(ptr, 0x84), inst)
            mstore(add(ptr, 0xa4), window)
            mstore(add(ptr, 0xc4), quorum)
            let n := sub(calldatasize(), 4)
            calldatacopy(add(ptr, 0xe4), 4, n)
            let ok := delegatecall(gas(), lib, ptr, add(0xe4, n), 0, 0)
            if or(iszero(ok), ret) {
                returndatacopy(ptr, 0, returndatasize())
                if iszero(ok) { revert(ptr, returndatasize()) }
                return(ptr, returndatasize())
            }
        }
    }

    /// @dev `_govForward` for views. The library's view functions write nothing, so the call is
    ///      read-only; the cast only tells the compiler so.
    function _govView(bytes4 sel) internal view {
        function(bytes4, bool) internal f = _govForward;
        function(bytes4, bool) internal view v;
        // Function-type cast only: no memory or state touched.
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            v := f
        }
        v(sel, true);
    }

    // ================================================================== end GOVERNANCE

    // ------------------------------------------------------------------ views

    /// @notice What `member` must send to `contribute()` right now.
    /// @return period The period that would be paid.
    /// @return amount Installment plus late fees, in the asset's smallest unit.
    /// @return fees Late fees included in `amount`.
    /// @return payable_ False if the next period is in the future (nothing due yet).
    function amountDue(address member)
        external
        view
        returns (uint256 period, uint256 amount, uint256 fees, bool payable_)
    {
        Membership.Member storage m = _m.members[member];
        if (!m.active) revert Membership.NotAMember(member);
        // A dormant member who pays now pays the current period (see `contribute`).
        period = m.dormant ? PeriodMath.periodOf(block.timestamp) : m.nextPeriod;
        payable_ = period <= PeriodMath.periodOf(block.timestamp);
        fees = payable_ ? _lateFees(member, period, block.timestamp) : 0;
        amount = uint256(installment) + fees;
    }

    function memberOf(address account) external view returns (Membership.Member memory m) {
        _mView(Membership.memberOf.selector, false);
        (account, m);
    }

    /// @notice Members right now, dormant ones included.
    function memberCount() external view returns (uint256) {
        return _m.memberCount;
    }

    /// @notice Members marked dormant right now.
    function dormantCount() external view returns (uint256) {
        return _m.dormantCount;
    }

    /// @notice Members who can vote right now (the quorum base, ADR 0033).
    function voterCount() external view returns (uint256) {
        return _m.voterCount;
    }

    /// @notice Open requests naming `member` as inviter or proposer (at most 3).
    function openRequestsBy(address member) external view returns (uint256) {
        return _m.openBy[member];
    }

    /// @notice Members admitted with `member` as their confirmed inviter.
    function admittedVia(address member) external view returns (uint256) {
        return _m.admittedVia[member];
    }

    /// @notice Installments `member` has missed (past their fee-free deadline and unpaid).
    function periodsOverdue(address member) external view returns (uint256) {
        return Membership.periodsOverdue(_m, member, dueDay);
    }

    /// @notice Length of the member list behind `membersPage` (everyone who ever joined).
    function memberListLength() external view returns (uint256) {
        return _m.memberList.length;
    }

    /// @notice Paginated member list for the app (bounded by `limit`).
    function membersPage(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        _mView(Membership.membersPage.selector, false);
        (offset, limit, page);
    }

    function isMember(address account) external view returns (bool) {
        return _m.members[account].active;
    }

    function holidayFor(address member, uint256 period) external view returns (bool) {
        return _m.holidayFor[member][period];
    }

    function holidaysUsed(address member, uint256 year) external view returns (uint256) {
        return _m.holidaysUsed[member][year];
    }

    /// @notice Founders who haven't accepted yet: invite expiry (0 = none).
    function founderInviteExpiry(address account) external view returns (uint64) {
        return _m.founderInviteExpiry[account];
    }

    /// @notice `applicant`'s open join request id, or 0.
    function openRequestOf(address applicant) external view returns (uint256) {
        return _m.openJoinOf[applicant];
    }

    /// @notice The open dormant request about `member`, or 0.
    function openDormantOf(address member) external view returns (uint256) {
        return _m.openDormantOf[member];
    }

    function hasVoted(uint256 id, address voter) external view returns (bool) {
        return _m.hasVoted[id][voter];
    }

    /// @notice A member's display name here ("" if not set yet).
    function nameOf(address member) external view returns (string memory n) {
        _mView(Membership.nameOf.selector, false);
        (member, n);
    }

    /// @notice The member currently using `displayName` (any letter case), or address(0).
    function memberByName(string calldata displayName) external view returns (address a) {
        _mView(Membership.memberByName.selector, true);
        (displayName, a);
    }

    /// @notice True if `account` could take `displayName` right now.
    function isNameAvailable(string calldata displayName, address account)
        external
        view
        returns (bool ok)
    {
        _mView(Membership.isNameAvailable.selector, true);
        (displayName, account, ok);
    }

    function requestCount() external view returns (uint256) {
        return _m.requests.length;
    }

    function getRequest(uint256 id) external view returns (Membership.Request memory r) {
        _mView(Membership.getRequest.selector, false);
        (id, r);
    }

    function openRequestCount() external view returns (uint256) {
        return _m.openIds.length;
    }

    /// @notice Paginated open requests (order changes as requests close).
    function openRequestsPage(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, Membership.Request[] memory page)
    {
        _mView(Membership.openRequestsPage.selector, false);
        (offset, limit, ids, page);
    }

    /// @notice True if `voter` can vote on request `id` right now.
    function canVote(uint256 id, address voter) external view returns (bool ok) {
        _mView(Membership.canVote.selector, false);
        (id, voter, ok);
    }

    /// @notice Current value of `member`'s stake (asset's smallest unit).
    function stakeOf(address member) external view returns (uint256) {
        return SharesMath.assetsForShares(
            _m.members[member].shares, _ledger.totalAssets, _ledger.totalShares
        );
    }

    /// @notice NAV per 1e18 shares, for display.
    function navPerShareE18() external view returns (uint256) {
        return SharesMath.assetsForShares(1e18, _ledger.totalAssets, _ledger.totalShares);
    }

    function currentPeriod() external view returns (uint256) {
        return PeriodMath.periodOf(block.timestamp);
    }

    /// @notice Cash plus loans outstanding (asset's smallest unit).
    function totalAssets() external view returns (uint256) {
        return _ledger.totalAssets;
    }

    function totalShares() external view returns (uint256) {
        return _ledger.totalShares;
    }

    /// @notice Principal lent out to members right now.
    function loansOutstanding() external view returns (uint256) {
        return _ledger.loansOutstanding;
    }

    /// @notice Money the circle holds and may use (total assets minus loans out).
    function cash() external view returns (uint256) {
        return _ledger.cash();
    }

    /// @notice A payout `account`'s wallet refused, waiting for `withdraw`.
    function withdrawable(address account) external view returns (uint256) {
        return _ledger.withdrawable[account];
    }

    /// @notice The circle's loan, exit and governance settings in force right now (a passed
    ///         change counts from its `effectiveAt`, ADR 0043).
    function rules() external view returns (Rules.Params memory r) {
        _view(address(Rules), Rules.read.selector, _rulesSlot(), false);
        r;
    }

    // ------------------------------------------------------------------ internals

    function _validate(Config memory cfg, uint256 invited) internal pure {
        if (!CircleName.isValid(cfg.name)) {
            revert InvalidConfig("name must be 3..48 letters, digits, spaces or _-'& (no links)");
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
        if (cfg.dormantAfter < 1 || cfg.dormantAfter > MAX_DORMANT_AFTER) {
            revert InvalidConfig("dormantAfter must be 1..12");
        }
        if (cfg.minPaidToVote > MAX_MIN_PAID_TO_VOTE) {
            revert InvalidConfig("minPaidToVote must be 0..6");
        }
        if (cfg.maxMembers < MIN_MAX_MEMBERS || cfg.maxMembers > MAX_MAX_MEMBERS) {
            revert InvalidConfig("maxMembers must be 3..50");
        }
        if (cfg.maxMembers < invited + 1) {
            revert InvalidConfig("maxMembers must be at least the creator plus invited founders");
        }
    }

    function _params() internal view returns (Membership.Params memory) {
        return Membership.Params({
            factory: factory,
            dueDay: dueDay,
            votingWindow: votingWindow,
            quorumPct: quorumPct,
            maxMembers: maxMembers,
            dormantAfter: dormantAfter,
            minPaidToVote: minPaidToVote
        });
    }

    /// @dev Reverts unless `who` is a member who isn't dormant.
    function _activeMember(address who) internal view returns (Membership.Member storage m) {
        m = _m.members[who];
        if (!m.active) revert Membership.NotAMember(who);
        if (m.dormant) revert Membership.MemberIsDormant(who);
    }

    /// @dev Applies a passed rule change once its time has come (GOV-04, RT-24). Called first by
    ///      every write that reads the rules, so nobody can pick the moment a change lands.
    function _syncRules() internal {
        uint64 at = _gov.effectiveAt;
        if (at != 0 && block.timestamp >= at) _govForward(Governance.syncRules.selector, false);
    }

    /// @dev The rules in force right now: the pending ones once their `effectiveAt` has passed.
    function _effRules() internal view returns (Rules.Params storage r) {
        r = _rules;
        uint64 at = _gov.effectiveAt;
        if (at != 0 && block.timestamp >= at) r = _gov.pendingRules;
    }

    function _lateFees(address member, uint256 period, uint256 at) internal view returns (uint256) {
        // A fee waiver voted by the circle (Governance) clears both late fees for that period.
        if (_m.feeWaived[member][period]) return 0;
        return FeeMath.lateFees(
            period, _m.holidayFor[member][period], at, dueDay, secondFeeDay, fee1, fee2
        );
    }

    // slither-disable-end incorrect-return,redundant-statements

    // ------------------------------------------------------------------ no plain transfers

    receive() external payable {
        revert DirectTransferNotAllowed();
    }

    fallback() external payable {
        revert DirectTransferNotAllowed();
    }
}
