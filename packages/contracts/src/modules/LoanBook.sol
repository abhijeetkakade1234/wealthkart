// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {PeriodMath} from "../libraries/PeriodMath.sol";
import {SharesMath} from "../libraries/SharesMath.sol";
import {Membership} from "./Membership.sol";
import {IReputation} from "../interfaces/IReputation.sol";
import {Ledger} from "./Ledger.sol";
import {Rules} from "./Rules.sol";

/// @title LoanBook
/// @notice Loans inside a circle (ADR 0007, 0009, 0018, 0038): a member asks for a loan, the
///         circle votes, and if it passes the AVAX goes to the borrower in the same transaction.
///         Interest is charged monthly from the month after the loan, with step-ups each tenor
///         (rule 15), late fees on unpaid interest, and a default after `defaultAfter` missed
///         months or when the third tenor ends. A default freezes the borrower and guarantor;
///         paying everything owed lifts it; a second vote can use their shares to repay.
/// @dev External library (ADR 0031, 0037): the vault delegatecalls it, so every write lands in the
///      vault's storage. Money goes only through `Ledger` (`payOut` last, CEI). Every number comes
///      from `Rules.Params`; each loan copies its rates, tenor length, interest late fee and
///      `defaultAfter` at disbursal, so a later rule change never reprices a running loan
///      (ADR 0043, LOAN-04). Phase 2 simplifications (ADR 0037): one active
///      loan and one pending request per member; interest must be paid in full, not in parts.
///      No loops over time: interest for any range of months is computed in O(1) from the three
///      tenor segments, so a loan left unpaid for years still costs the same gas (ADR 0015).
library LoanBook {
    // ------------------------------------------------------------------ types

    enum Kind {
        /// @dev A member asks to borrow.
        Loan,
        /// @dev A member asks to use a defaulted borrower's (then guarantor's) shares to repay.
        Settle
    }

    enum Status {
        None,
        Open,
        /// @dev Loan: passed and paid out. Settle: passed and the shares were used.
        Approved,
        Rejected,
        /// @dev Voting window ended without quorum.
        Expired,
        /// @dev Loan: withdrawn by the borrower. Settle: the loan was cured or closed first.
        Cancelled,
        /// @dev Loan passed but couldn't be paid out: no lendable cash, a cap no longer fits, the
        ///      guarantor never accepted, the borrower got frozen, the circle dissolved, or exits
        ///      or a pause blocked it for a whole extra voting window after the deadline.
        Failed
    }

    struct Request {
        Kind kind;
        Status status;
        bool medical;
        /// @dev Loan: the named guarantor called `acceptGuarantee`. Settle: always true.
        bool guarantorAccepted;
        address borrower;
        uint64 deadline;
        /// @dev Voters possible at request time minus those who can't vote on it: the quorum base.
        uint32 eligible;
        address guarantor;
        /// @dev Only members with seq <= seqSnapshot can vote (in the circle before the request).
        uint32 seqSnapshot;
        uint32 yes;
        uint32 no;
        /// @dev Loan: amount asked for. Settle: principal outstanding when proposed.
        uint128 amount;
    }

    struct Loan {
        address guarantor;
        /// @dev Period (month) the AVAX was sent. Interest starts the month after.
        uint32 disbursedPeriod;
        /// @dev Interest is paid for every month up to and including this one.
        uint32 paidThrough;
        /// @dev Interest for months after `paidThrough` up to this one is fixed in `carried`
        ///      (booked before a repayment changed the principal). Always >= paidThrough.
        uint32 bookedThrough;
        /// @dev Principal still owed, in wei. 0 = no loan.
        uint128 principal;
        /// @dev Principal sent at disbursal, in wei.
        uint128 amount;
        /// @dev Unpaid interest booked for months (paidThrough, bookedThrough], in wei.
        uint128 carried;
        /// @dev Monthly rates in bps for tenors 1, 2 and 3+, copied at disbursal.
        uint16 rate1;
        uint16 rate2;
        uint16 rate3;
        /// @dev Months per tenor, copied at disbursal.
        uint8 tenorMonths;
        /// @dev Medical: months free of interest counting the disbursal month (rule 18).
        uint8 freeMonths;
        bool medical;
        bool defaulted;
        /// @dev Some interest has been paid on this loan (rule 17 then no longer applies).
        bool charged;
        /// @dev Missed interest months before default, copied at disbursal (LOAN-04).
        uint8 defaultAfter;
        /// @dev Period the loan was marked in default (0 = not in default). A settle charges
        ///      interest and late fees only up to this month (LOAN-06).
        uint32 defaultPeriod;
        /// @dev Late fee per month of unpaid interest, copied at disbursal (LOAN-04).
        uint128 interestFee;
    }

    /// @dev The vault's immutable settings this module needs.
    struct Ctx {
        uint8 dueDay;
        uint32 votingWindow;
        uint8 quorumPct;
        /// @dev The soulbound record loan outcomes are written to (ADR 0042).
        address reputation;
        /// @dev The first exit in the queue has finished its notice and isn't paid yet: no
        ///      disbursal until it is (RT-17, LOAN-07).
        bool exitDue;
    }

    struct Store {
        mapping(address borrower => Loan) loans;
        /// @dev Request id `n` lives at index `n - 1`; id 0 means "none".
        Request[] requests;
        /// @dev The borrower's open loan request, or 0.
        mapping(address borrower => uint256 requestId) pendingOf;
        /// @dev The open settle request about a borrower, or 0.
        mapping(address borrower => uint256 requestId) settleOf;
        /// @dev Borrower whose request or loan this member guarantees (accepted), or 0 (RT-16).
        mapping(address guarantor => address borrower) guaranteeOf;
        /// @dev UTC year + 1 of the member's last medical loan (0 = never), rule 18.
        mapping(address borrower => uint256) medicalYear;
        mapping(uint256 requestId => mapping(address voter => bool)) hasVoted;
        /// @dev Open request ids, swap-and-pop; `openPos` is index + 1. At most one loan request
        ///      and one settle request per member, so the list is bounded by the member count.
        uint256[] openIds;
        mapping(uint256 requestId => uint256) openPos;
    }

    // ------------------------------------------------------------------ constants

    uint256 internal constant BPS = 10_000;
    uint256 private constant PERCENT = 100;
    /// @dev Tenors with their own rate (rule 15); after the third the loan is due.
    uint256 internal constant TENORS = 3;
    /// @dev Shortest vote on a medical loan (RT-19). Medical votes run half the normal window.
    uint32 internal constant MIN_MEDICAL_WINDOW = 1 hours;

    // ------------------------------------------------------------------ events

    event LoanRequested(
        uint256 indexed requestId,
        address indexed borrower,
        address indexed guarantor,
        uint256 amount,
        bool medical,
        uint256 deadline,
        uint256 eligible
    );
    event GuaranteeAccepted(
        uint256 indexed requestId, address indexed borrower, address indexed guarantor
    );
    event SettleProposed(
        uint256 indexed requestId,
        address indexed borrower,
        address indexed proposer,
        uint256 deadline,
        uint256 eligible
    );
    event LoanVoted(uint256 indexed requestId, address indexed voter, bool support);
    event LoanRequestClosed(uint256 indexed requestId, Kind kind, Status status);
    event LoanDisbursed(
        uint256 indexed requestId, address indexed borrower, uint256 amount, uint256 period
    );
    event InterestPaid(
        address indexed borrower, uint256 interest, uint256 fees, uint256 throughPeriod
    );
    /// @param minInterest Rule 17 interest added to a loan repaid before any interest was due.
    event LoanRepaid(
        address indexed borrower, uint256 principal, uint256 minInterest, uint256 remaining
    );
    event LoanDefaulted(address indexed borrower, address indexed guarantor, uint256 overdueMonths);
    event LoanCured(address indexed borrower);
    event LoanSettled(
        address indexed borrower,
        address indexed guarantor,
        uint256 fromBorrower,
        uint256 fromGuarantor,
        uint256 writtenOff
    );

    // ------------------------------------------------------------------ errors

    error LoansClosed();
    error LoansPaused();
    error NotAVoter(address account);
    error MemberFrozen(address account);
    error LoanRequestOpen(uint256 requestId);
    error LoanActive(address borrower);
    error TooFewMembers(uint256 members, uint256 required);
    error ZeroAmount();
    error AmountTooLarge(uint256 amount, uint256 limit);
    error MedicalLoansOff();
    error MedicalLoanThisYear(uint256 year);
    error GuarantorRequired();
    error InvalidGuarantor(address guarantor);
    error AlreadyGuaranteeing(address guarantor, address borrower);
    error NotYourGuarantee(address borrower);
    error NoOtherLoanVoters();
    error LoanRequestNotOpen(uint256 requestId);
    error LoanVotingClosed(uint256 requestId);
    error CannotVoteOnLoan(uint256 requestId, address voter);
    error AlreadyVotedOnLoan(uint256 requestId);
    error LoanNotDecidedYet(uint256 requestId);
    error GuaranteeNotAccepted(uint256 requestId);
    /// @dev Exits are waiting for cash (RT-17) or the guardian pause is on: try again later.
    error DisbursalBlocked(uint256 requestId);
    error NoLoanRequest();
    error NoLoan(address borrower);
    error NothingOwed();
    error WrongLoanAmount(uint256 expected, uint256 sent);
    error InterestOverdue(uint256 months);
    error InterestOwed(uint256 amount);
    error NotInDefault(address borrower);
    error AlreadyDefaulted(address borrower);
    error SettleOpen(uint256 requestId);
    /// @notice A member who asked to leave can't borrow or guarantee (EXIT-06, LOAN-09).
    error MemberExiting(address account);

    // ------------------------------------------------------------------ requests

    /// @notice Ask the circle for a loan. Checks run now and again at payout.
    function requestLoan(
        Store storage s,
        Membership.Store storage m,
        Ledger.Store storage led,
        Rules.Params storage r,
        Ctx calldata c,
        uint256 amount,
        bool medical,
        address guarantor
    ) external returns (uint256 id) {
        _checkRequest(s, m, led, r, amount, medical, guarantor);
        // The borrower is a current voter, so they are inside voterCount and can't vote here.
        uint32 eligible = SafeCast.toUint32(m.voterCount - 1);
        if (eligible == 0) revert NoOtherLoanVoters();
        uint32 window = c.votingWindow;
        if (medical) {
            window /= 2;
            if (window < MIN_MEDICAL_WINDOW) window = MIN_MEDICAL_WINDOW;
        }
        id = _open(s, m, Kind.Loan, msg.sender, guarantor, amount, eligible, window);
        Request storage q = s.requests[id - 1];
        q.medical = medical;
        s.pendingOf[msg.sender] = id;
        m.members[msg.sender].loanTies += 1;
        emit LoanRequested(id, msg.sender, guarantor, amount, medical, q.deadline, eligible);
    }

    /// @notice The named guarantor agrees to back `borrower`'s open request (rule 11). Ties the
    ///         guarantor (no exit) until the request closes or the loan is repaid or settled.
    function acceptGuarantee(
        Store storage s,
        Membership.Store storage m,
        Ledger.Store storage led,
        Rules.Params storage r,
        Ctx calldata c,
        address borrower
    ) external {
        uint256 id = s.pendingOf[borrower];
        if (id == 0) revert NoLoanRequest();
        Request storage q = s.requests[id - 1];
        if (q.guarantor != msg.sender || q.guarantorAccepted) revert NotYourGuarantee(borrower);
        if (block.timestamp > q.deadline) revert LoanVotingClosed(id);
        _checkGuarantor(s, m, msg.sender);
        q.guarantorAccepted = true;
        s.guaranteeOf[msg.sender] = borrower;
        m.members[msg.sender].loanTies += 1;
        emit GuaranteeAccepted(id, borrower, msg.sender);
        // The vote may already have passed and only waited for this.
        _decide(s, m, led, r, c, id, false, false);
    }

    /// @notice Propose using a defaulted borrower's shares, then the guarantor's, to repay the
    ///         loan (ADR 0009). The proposer's yes is counted. The borrower and guarantor can't
    ///         vote. Once the circle is dissolved, anyone settles it at once with no vote.
    function proposeSettle(
        Store storage s,
        Membership.Store storage m,
        Ledger.Store storage led,
        Rules.Params storage r,
        Ctx calldata c,
        address borrower
    ) external returns (uint256 id) {
        Loan storage ln = s.loans[borrower];
        if (!ln.defaulted) revert NotInDefault(borrower);
        uint256 open = s.settleOf[borrower];
        if (open != 0) revert SettleOpen(open);
        if (led.dissolved) {
            // Winding down (LOAN-02, GOV-06): nobody pays installments any more, so nobody stays
            // a voter. A defaulted loan is settled at once, by anyone, with no vote; returns 0.
            _settle(s, m, led, c, borrower);
            return 0;
        }
        address g = ln.guarantor;
        if (msg.sender == borrower || msg.sender == g || !Membership.isCurrentVoter(m, msg.sender))
        {
            revert NotAVoter(msg.sender);
        }
        uint256 voters = m.voterCount - _inVoterCount(m, borrower);
        if (g != address(0)) voters -= _inVoterCount(m, g);
        id = _open(
            s, m, Kind.Settle, borrower, g, ln.principal, SafeCast.toUint32(voters), c.votingWindow
        );
        Request storage q = s.requests[id - 1];
        q.guarantorAccepted = true;
        s.settleOf[borrower] = id;
        emit SettleProposed(id, borrower, msg.sender, q.deadline, voters);
        _castVote(s, id, q, true);
        _decide(s, m, led, r, c, id, false, false);
    }

    /// @notice Vote on an open loan or settle request. The vote that decides it settles it, and a
    ///         passing loan is paid out in the same transaction (D4c).
    function vote(
        Store storage s,
        Membership.Store storage m,
        Ledger.Store storage led,
        Rules.Params storage r,
        Ctx calldata c,
        uint256 id,
        bool support
    ) external {
        Request storage q = _openRequest(s, id);
        if (block.timestamp > q.deadline) revert LoanVotingClosed(id);
        if (!_canVoteOn(m, q, msg.sender)) revert CannotVoteOnLoan(id, msg.sender);
        if (s.hasVoted[id][msg.sender]) revert AlreadyVotedOnLoan(id);
        _castVote(s, id, q, support);
        _decide(s, m, led, r, c, id, false, false);
    }

    /// @notice Settle a request once its outcome is certain or its window has ended. Anyone can
    ///         call this. Reverts (and stays open) while exits wait for cash or the guardian pause
    ///         is on, so a passed loan can be paid out later (RT-17), but only until one more
    ///         voting window after the deadline; after that it closes as Failed.
    function finalize(
        Store storage s,
        Membership.Store storage m,
        Ledger.Store storage led,
        Rules.Params storage r,
        Ctx calldata c,
        uint256 id
    ) external {
        Request storage q = _openRequest(s, id);
        _decide(s, m, led, r, c, id, block.timestamp > q.deadline, true);
    }

    /// @notice Withdraw your own open loan request.
    function cancel(Store storage s, Membership.Store storage m) external {
        uint256 id = s.pendingOf[msg.sender];
        if (id == 0) revert NoLoanRequest();
        _close(s, m, id, Status.Cancelled);
    }

    // ------------------------------------------------------------------ paying back

    /// @notice Pay all interest and late fees owed up to now, including the current month even if
    ///         it isn't due yet. AVAX circles: `value` (msg.value) must match `interestDue`
    ///         exactly. USDT circles: `value` must be 0 and the exact amount is pulled (ADR 0046).
    ///         Cures a default when nothing else is owed.
    function payInterest(
        Store storage s,
        Membership.Store storage m,
        Ledger.Store storage led,
        Ctx calldata c,
        uint256 value
    ) external {
        Loan storage ln = _loan(s, msg.sender);
        (uint256 interest, uint256 fees,) = _owed(ln, c.dueDay, _period());
        uint256 total = interest + fees;
        // slither-disable-next-line incorrect-equality (computed amount owed; 0 = nothing to pay)
        if (total == 0) revert NothingOwed();
        bool token = led.token != address(0);
        if (token ? value != 0 : value != total) {
            if (token) revert Ledger.AvaxNotAccepted();
            revert WrongLoanAmount(total, value);
        }
        uint32 cur = _period();
        ln.carried = 0;
        ln.paidThrough = cur;
        ln.bookedThrough = cur;
        if (interest != 0) ln.charged = true;
        // Interest and fees are income: they raise NAV for every member (ADR 0009).
        led.totalAssets += total;
        emit InterestPaid(msg.sender, interest, fees, cur);
        _maybeCure(s, m, c, msg.sender);
        if (token) Ledger.pull(led, total);
    }

    /// @notice Repay principal. Needs no overdue interest. This month's interest stays on the
    ///         balance at the start of the month (S-LOAN-07). Repaying in full needs all interest
    ///         paid, and adds one month's interest if none was ever charged (rule 17).
    /// @param value Amount repaid: the principal, or for a rule-17 payoff the principal plus that
    ///        month's interest (see `payoffDue`).
    /// @param sent msg.value: equal to `value` in an AVAX circle, 0 in a USDT circle, which
    ///        pulls `value` instead (ADR 0046).
    function repay(
        Store storage s,
        Membership.Store storage m,
        Ledger.Store storage led,
        Rules.Params storage r,
        Ctx calldata c,
        uint256 value,
        uint256 sent
    ) external {
        bool token = led.token != address(0);
        if (token ? sent != 0 : sent != value) {
            if (token) revert Ledger.AvaxNotAccepted();
            revert WrongLoanAmount(value, sent);
        }
        if (value == 0) revert ZeroAmount();
        Loan storage ln = _loan(s, msg.sender);
        uint256 overdue = _overdueMonths(ln, c.dueDay, _period());
        if (overdue != 0) revert InterestOverdue(overdue);
        _book(ln);

        uint256 owedPrincipal = ln.principal;
        uint256 minInterest = _minInterest(ln, r.minInterestMonth);
        uint256 part = 0;
        if (minInterest != 0 && value == owedPrincipal + minInterest) {
            part = owedPrincipal;
        } else if (value < owedPrincipal || (value == owedPrincipal && minInterest == 0)) {
            part = value;
            minInterest = 0;
        } else {
            revert WrongLoanAmount(owedPrincipal + minInterest, value);
        }
        if (part == owedPrincipal && ln.carried != 0) revert InterestOwed(ln.carried);

        // Principal: cash up, loans out down, total assets unchanged. Rule 17 interest is income.
        ln.principal = SafeCast.toUint128(owedPrincipal - part);
        led.loansOutstanding -= part;
        if (minInterest != 0) {
            ln.charged = true;
            led.totalAssets += minInterest;
        }
        emit LoanRepaid(msg.sender, part, minInterest, owedPrincipal - part);
        if (part == owedPrincipal) {
            _closeLoan(s, m, msg.sender);
            // Last: the trusted record from our own factory (ADR 0042).
            IReputation(c.reputation).recordLoanOutcome(msg.sender, true);
        } else {
            _maybeCure(s, m, c, msg.sender);
        }
        if (token) Ledger.pull(led, value);
    }

    // ------------------------------------------------------------------ default

    /// @notice Mark `borrower`'s loan in default: `defaultAfter` months of interest overdue, or
    ///         the third tenor ended with principal left (rule 15). Freezes the borrower and the
    ///         guarantor (no exit, no new loan). Anyone can call this.
    function markDefault(
        Store storage s,
        Membership.Store storage m,
        Ctx calldata c,
        address borrower
    ) external {
        Loan storage ln = _loan(s, borrower);
        if (ln.defaulted) revert AlreadyDefaulted(borrower);
        if (!_defaultable(ln, c.dueDay)) revert NotInDefault(borrower);
        ln.defaulted = true;
        ln.defaultPeriod = _period();
        address g = ln.guarantor;
        _syncFrozen(s, m, borrower);
        if (g != address(0)) _syncFrozen(s, m, g);
        emit LoanDefaulted(borrower, g, _overdueMonths(ln, c.dueDay, _period()));
        // A default stays on the borrower's record even if cured later (ADR 0042).
        IReputation(c.reputation).recordLoanOutcome(borrower, false);
    }

    // ------------------------------------------------------------------ views

    function loanOf(Store storage s, address borrower) external view returns (Loan memory) {
        return s.loans[borrower];
    }

    /// @notice Interest and fees `borrower` must send to `payInterest` right now.
    /// @return interest Unpaid interest up to and including the current month.
    /// @return fees Late fees: `interestFee` for each month whose interest is overdue.
    /// @return overdueMonths Months whose interest is past its due moment and unpaid.
    function interestDue(Store storage s, Rules.Params storage, Ctx calldata c, address borrower)
        external
        view
        returns (uint256 interest, uint256 fees, uint256 overdueMonths)
    {
        Loan storage ln = s.loans[borrower];
        if (ln.principal == 0) return (0, 0, 0);
        return _owed(ln, c.dueDay, _period());
    }

    /// @notice What `repay` needs to close the loan right now: principal plus rule-17 interest.
    ///         Unpaid interest must be paid with `payInterest` first.
    function payoffDue(Store storage s, Rules.Params storage r, address borrower)
        external
        view
        returns (uint256)
    {
        Loan storage ln = s.loans[borrower];
        if (ln.principal == 0) return 0;
        uint256 cur = _period();
        // A month booked now would make rule 17 not apply (see `_minInterest`).
        bool booked = ln.carried != 0 || _span(ln, uint256(ln.bookedThrough) + 1, cur, 1) != 0;
        uint256 minInterest = booked ? 0 : _minInterest(ln, r.minInterestMonth);
        return uint256(ln.principal) + minInterest;
    }

    function loanRequest(Store storage s, uint256 id) external view returns (Request memory) {
        if (id == 0 || id > s.requests.length) revert LoanRequestNotOpen(id);
        return s.requests[id - 1];
    }

    /// @notice Paginated open loan and settle requests (order changes as requests close).
    function openPage(Store storage s, uint256 offset, uint256 limit)
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

    /// @notice True if `voter` can vote on loan request `id` right now.
    function canVote(Store storage s, Membership.Store storage m, uint256 id, address voter)
        external
        view
        returns (bool)
    {
        if (id == 0 || id > s.requests.length) return false;
        Request storage q = s.requests[id - 1];
        return q.status == Status.Open && block.timestamp <= q.deadline && _canVoteOn(m, q, voter)
            && !s.hasVoted[id][voter];
    }

    /// @notice Cash that can be lent right now: cash minus the reserve (rule 12).
    function lendableCash(Ledger.Store storage led, Rules.Params storage r)
        external
        view
        returns (uint256)
    {
        return _lendable(led, r.reserveBps);
    }

    // ------------------------------------------------------------------ request internals

    function _checkRequest(
        Store storage s,
        Membership.Store storage m,
        Ledger.Store storage led,
        Rules.Params storage r,
        uint256 amount,
        bool medical,
        address guarantor
    ) private view {
        if (led.dissolved) revert LoansClosed();
        if (Ledger.paused(led)) revert LoansPaused();
        address b = msg.sender;
        if (m.members[b].exiting) revert MemberExiting(b);
        if (m.members[b].frozen) revert MemberFrozen(b);
        if (!Membership.isCurrentVoter(m, b)) revert NotAVoter(b);
        uint256 open = s.pendingOf[b];
        if (open != 0) revert LoanRequestOpen(open);
        // A guarantor backs exactly one loan and holds none of their own (LOAN-01).
        address backed = s.guaranteeOf[b];
        if (backed != address(0)) revert AlreadyGuaranteeing(b, backed);
        if (s.loans[b].principal != 0) revert LoanActive(b);
        if (m.memberCount < r.minMembersForLoans) {
            revert TooFewMembers(m.memberCount, r.minMembersForLoans);
        }
        if (amount == 0) revert ZeroAmount();
        if (medical) {
            uint256 cap = r.medicalCap;
            if (cap == 0) revert MedicalLoansOff();
            if (amount > cap) revert AmountTooLarge(amount, cap);
            uint256 year = PeriodMath.periodOf(block.timestamp) / 12;
            // slither-disable-next-line incorrect-equality (a stored year tag, not a balance)
            if (s.medicalYear[b] == year + 1) revert MedicalLoanThisYear(year);
        }
        if (guarantor == address(0)) {
            if (r.guarantorRequired) revert GuarantorRequired();
        } else {
            if (guarantor == b) revert InvalidGuarantor(guarantor);
            _checkGuarantor(s, m, guarantor);
        }
        uint256 limit = _limit(m, led, r, b, guarantor);
        if (amount > limit) revert AmountTooLarge(amount, limit);
    }

    /// @dev An active, non-dormant, non-frozen member who isn't leaving, has no loan or loan
    ///      request of their own and no other guarantee, so one stake never backs two loans
    ///      (RT-16, LOAN-01). Checked on request and on `acceptGuarantee`.
    function _checkGuarantor(Store storage s, Membership.Store storage m, address g) private view {
        if (!_guarantorOk(s, m, g)) {
            if (m.members[g].exiting) revert MemberExiting(g);
            revert InvalidGuarantor(g);
        }
        address backed = s.guaranteeOf[g];
        if (backed != address(0)) revert AlreadyGuaranteeing(g, backed);
    }

    /// @dev Guarantor standing apart from `guaranteeOf` (which may already be this request).
    function _guarantorOk(Store storage s, Membership.Store storage m, address g)
        private
        view
        returns (bool)
    {
        Membership.Member storage gm = m.members[g];
        return gm.active && !gm.dormant && !gm.frozen && !gm.exiting && s.loans[g].principal == 0
            && s.pendingOf[g] == 0;
    }

    /// @dev Largest loan allowed now: the fund cap (rule 13), k x (own + guarantor stake)
    ///      (ADR 0018) and lendable cash after the reserve (rule 12), whichever is lowest.
    function _limit(
        Membership.Store storage m,
        Ledger.Store storage led,
        Rules.Params storage r,
        address b,
        address g
    ) private view returns (uint256 limit) {
        uint256 ta = led.totalAssets;
        uint256 ts = led.totalShares;
        limit = Math.mulDiv(ta, r.maxLoanBps, BPS);
        uint256 stake = SharesMath.assetsForShares(m.members[b].shares, ta, ts);
        if (g != address(0)) stake += SharesMath.assetsForShares(m.members[g].shares, ta, ts);
        uint256 kCap = stake * r.kMultiplier;
        if (kCap < limit) limit = kCap;
        uint256 lendable = _lendable(led, r.reserveBps);
        if (lendable < limit) limit = lendable;
    }

    function _lendable(Ledger.Store storage led, uint16 reserveBps) private view returns (uint256) {
        uint256 reserve = Math.mulDiv(led.totalAssets, reserveBps, BPS, Math.Rounding.Ceil);
        uint256 c = Ledger.cash(led);
        return c > reserve ? c - reserve : 0;
    }

    function _open(
        Store storage s,
        Membership.Store storage m,
        Kind kind,
        address borrower,
        address guarantor,
        uint256 amount,
        uint32 eligible,
        uint32 window
    ) private returns (uint256 id) {
        if (eligible == 0) revert NoOtherLoanVoters();
        s.requests
            .push(
                Request({
                    kind: kind,
                    status: Status.Open,
                    medical: false,
                    guarantorAccepted: false,
                    borrower: borrower,
                    deadline: SafeCast.toUint64(block.timestamp) + window,
                    eligible: eligible,
                    guarantor: guarantor,
                    seqSnapshot: m.seqCounter,
                    yes: 0,
                    no: 0,
                    amount: SafeCast.toUint128(amount)
                })
            );
        id = s.requests.length;
        s.openIds.push(id);
        s.openPos[id] = s.openIds.length;
    }

    function _castVote(Store storage s, uint256 id, Request storage q, bool support) private {
        s.hasVoted[id][msg.sender] = true;
        if (support) q.yes += 1;
        else q.no += 1;
        emit LoanVoted(id, msg.sender, support);
    }

    /// @dev Snapshot voter (seq <= seqSnapshot) who can vote now; never the borrower, and never
    ///      the guarantor on a settle vote (they would vote on their own shares).
    function _canVoteOn(Membership.Store storage m, Request storage q, address voter)
        private
        view
        returns (bool)
    {
        if (voter == q.borrower) return false;
        if (q.kind == Kind.Settle && voter == q.guarantor) return false;
        return Membership.canVoteAt(m, voter, q.seqSnapshot);
    }

    /// @dev 1 if `who` is counted in `voterCount`, else 0.
    function _inVoterCount(Membership.Store storage m, address who) private view returns (uint256) {
        return Membership.inVoterCount(m, who) ? 1 : 0;
    }

    /// @dev Same rule as Membership votes: quorum of `eligible`, pass mark of votes cast, decided
    ///      early only when the remaining votes can't change the result.
    function _outcome(Request storage q, uint8 quorumPct, uint8 passPct, bool ended)
        private
        view
        returns (Status)
    {
        // yes + no <= e: only snapshot voters who can vote now (minus the borrower, and the
        // guarantor on a settle) vote, and at most `eligible` of them existed at request time.
        uint256 e = q.eligible;
        uint256 yes = q.yes;
        uint256 no = q.no;
        uint256 cast = yes + no;
        bool quorum = cast * PERCENT >= uint256(quorumPct) * e;
        if (quorum && Rules.passes(yes, e, passPct)) return Status.Approved;
        if (!Rules.passes(e > no ? e - no : 0, e, passPct)) return Status.Rejected;
        if (!ended) return Status.Open;
        if (!quorum) return Status.Expired;
        return Rules.passes(yes, cast, passPct) ? Status.Approved : Status.Rejected;
    }

    /// @dev Closes the request if its outcome is known. A passing loan is paid out here, as the
    ///      very last step. `strict` (finalize) reverts when there's nothing to do yet; votes and
    ///      guarantee acceptance never revert because of the outcome.
    function _decide(
        Store storage s,
        Membership.Store storage m,
        Ledger.Store storage led,
        Rules.Params storage r,
        Ctx calldata c,
        uint256 id,
        bool ended,
        bool strict
    ) private {
        Request storage q = s.requests[id - 1];
        Status st = _outcome(q, c.quorumPct, r.passPct, ended);
        if (st == Status.Open) {
            if (strict) revert LoanNotDecidedYet(id);
            return;
        }
        if (st != Status.Approved) {
            _close(s, m, id, st);
            return;
        }
        address b = q.borrower;
        if (q.kind == Kind.Settle) {
            // Cured or closed while the vote ran: nothing to settle.
            if (!s.loans[b].defaulted) {
                _close(s, m, id, Status.Cancelled);
                return;
            }
            _close(s, m, id, Status.Approved);
            _settle(s, m, led, c, b);
            return;
        }
        if (q.guarantor != address(0) && !q.guarantorAccepted) {
            if (ended) {
                _close(s, m, id, Status.Failed);
                return;
            }
            if (strict) revert GuaranteeNotAccepted(id);
            return;
        }
        if (led.dissolved) {
            _close(s, m, id, Status.Failed);
            return;
        }
        if (led.exitsWaiting != 0 || c.exitDue || Ledger.paused(led)) {
            // A passed vote waits at most one more voting window, so nobody is paid out on an
            // approval the circle gave long ago under different conditions.
            if (block.timestamp > uint256(q.deadline) + c.votingWindow) {
                _close(s, m, id, Status.Failed);
                return;
            }
            if (strict) revert DisbursalBlocked(id);
            return;
        }
        uint256 amount = q.amount;
        Membership.Member storage bm = m.members[b];
        address g = q.guarantor;
        // Standing and rules are checked again at payout (LOAN-05): the borrower may have gone
        // dormant, frozen or started to leave, the guarantor too, or the rules changed.
        if (
            !bm.active || bm.dormant || bm.frozen || bm.exiting
                || (g != address(0) && !_guarantorOk(s, m, g))
                || (q.medical && amount > r.medicalCap) || amount > _limit(m, led, r, b, g)
        ) {
            _close(s, m, id, Status.Failed);
            return;
        }
        _close(s, m, id, Status.Approved);
        _disburse(s, led, r, id, b, q.guarantor, amount, q.medical);
    }

    /// @dev Records the loan, then pays the borrower last (CEI). A wallet that refuses the money
    ///      (or that Tether froze) gets it as `withdrawable` instead (RT-20, ADR 0046).
    function _disburse(
        Store storage s,
        Ledger.Store storage led,
        Rules.Params storage r,
        uint256 id,
        address b,
        address g,
        uint256 amount,
        bool medical
    ) private {
        uint32 cur = _period();
        Loan storage ln = s.loans[b];
        ln.guarantor = g;
        ln.disbursedPeriod = cur;
        ln.paidThrough = cur;
        ln.bookedThrough = cur;
        ln.principal = SafeCast.toUint128(amount);
        ln.amount = SafeCast.toUint128(amount);
        ln.rate1 = r.interestBps;
        ln.rate2 = r.tenor2Bps;
        ln.rate3 = r.tenor3Bps;
        ln.tenorMonths = r.tenorMonths;
        ln.freeMonths = r.medicalFreeMonths;
        ln.defaultAfter = r.defaultAfter;
        ln.interestFee = r.interestFee;
        ln.medical = medical;
        if (medical) s.medicalYear[b] = cur / 12 + 1;
        led.loansOutstanding += amount;
        emit LoanDisbursed(id, b, amount, cur);
        Ledger.payOut(led, b, amount);
    }

    /// @dev Marks the request closed, takes it off the open list and keeps `loanTies` exact.
    ///      An approved loan request keeps the borrower's and guarantor's ties for the loan.
    function _close(Store storage s, Membership.Store storage m, uint256 id, Status st) private {
        Request storage q = s.requests[id - 1];
        q.status = st;
        address b = q.borrower;
        if (q.kind == Kind.Loan) {
            delete s.pendingOf[b];
            if (st != Status.Approved) {
                m.members[b].loanTies -= 1;
                if (q.guarantorAccepted) {
                    address g = q.guarantor;
                    m.members[g].loanTies -= 1;
                    delete s.guaranteeOf[g];
                }
            }
        } else {
            delete s.settleOf[b];
        }
        uint256 pos = s.openPos[id];
        uint256 lastId = s.openIds[s.openIds.length - 1];
        s.openIds[pos - 1] = lastId;
        s.openPos[lastId] = pos;
        s.openIds.pop();
        delete s.openPos[id];
        emit LoanRequestClosed(id, q.kind, st);
    }

    function _openRequest(Store storage s, uint256 id) private view returns (Request storage q) {
        if (id == 0 || id > s.requests.length) revert LoanRequestNotOpen(id);
        q = s.requests[id - 1];
        if (q.status != Status.Open) revert LoanRequestNotOpen(id);
    }

    // ------------------------------------------------------------------ loan internals

    function _loan(Store storage s, address borrower) private view returns (Loan storage ln) {
        ln = s.loans[borrower];
        if (ln.principal == 0) revert NoLoan(borrower);
    }

    function _period() private view returns (uint32) {
        return SafeCast.toUint32(PeriodMath.periodOf(block.timestamp));
    }

    /// @dev Interest owed for months up to `upTo` (booked plus unbooked), late fees at the loan's
    ///      own fee, and the number of overdue months up to `upTo`.
    function _owed(Loan storage ln, uint8 dueDay, uint256 upTo)
        private
        view
        returns (uint256 interest, uint256 fees, uint256 overdue)
    {
        interest =
            uint256(ln.carried) + _span(ln, uint256(ln.bookedThrough) + 1, upTo, ln.principal);
        overdue = _overdueMonths(ln, dueDay, upTo);
        fees = overdue * ln.interestFee;
    }

    /// @dev Months after `paidThrough` (and up to `upTo`) whose due moment has passed and that
    ///      charge interest. Interest-free months (medical, or a 0% rate) are never overdue.
    function _overdueMonths(Loan storage ln, uint8 dueDay, uint256 upTo)
        private
        view
        returns (uint256)
    {
        uint256 cur = PeriodMath.periodOf(block.timestamp);
        uint256 lastDue = block.timestamp > PeriodMath.dueMoment(cur, dueDay) ? cur : cur - 1;
        if (upTo < lastDue) lastDue = upTo;
        // principal 1: each charging month adds at least 1 wei, so the sum counts the months.
        return _months(ln, uint256(ln.paidThrough) + 1, lastDue);
    }

    /// @dev Fixes the interest for months up to now at the current principal before a repayment
    ///      changes it, so each month is charged on its start-of-month balance.
    function _book(Loan storage ln) private {
        uint256 cur = _period();
        if (cur <= ln.bookedThrough) return;
        uint256 add = _span(ln, uint256(ln.bookedThrough) + 1, cur, ln.principal);
        ln.carried = SafeCast.toUint128(uint256(ln.carried) + add);
        ln.bookedThrough = SafeCast.toUint32(cur);
    }

    /// @dev Rule 17: one month's interest at the first-tenor rate on the amount lent, when the
    ///      loan is repaid before any interest was ever charged. Medical loans are exempt.
    function _minInterest(Loan storage ln, bool minInterestMonth) private view returns (uint256) {
        if (!minInterestMonth || ln.medical || ln.charged || ln.carried != 0) return 0;
        return _ceilBps(ln.amount, ln.rate1);
    }

    /// @dev The loan's own `defaultAfter` overdue interest months, or the third tenor ended with
    ///      principal left.
    function _defaultable(Loan storage ln, uint8 dueDay) private view returns (bool) {
        if (ln.principal == 0) return false;
        uint256 cur = PeriodMath.periodOf(block.timestamp);
        uint256 lastTenorMonth = uint256(ln.disbursedPeriod) + TENORS * ln.tenorMonths;
        if (cur > lastTenorMonth) return true;
        return _overdueMonths(ln, dueDay, cur) >= ln.defaultAfter;
    }

    /// @dev A cure pays everything owed up to now (the default-month cap only limits a settle).
    function _maybeCure(Store storage s, Membership.Store storage m, Ctx calldata c, address b)
        private
    {
        Loan storage ln = s.loans[b];
        if (!ln.defaulted || _defaultable(ln, c.dueDay)) return;
        ln.defaulted = false;
        ln.defaultPeriod = 0;
        _syncFrozen(s, m, b);
        if (ln.guarantor != address(0)) _syncFrozen(s, m, ln.guarantor);
        emit LoanCured(b);
    }

    /// @dev Ends a loan (repaid or settled): releases both ties and the guarantee, cancels an open
    ///      settle vote about it, and recomputes the frozen flags.
    function _closeLoan(Store storage s, Membership.Store storage m, address b) private {
        address g = s.loans[b].guarantor;
        delete s.loans[b];
        m.members[b].loanTies -= 1;
        _syncFrozen(s, m, b);
        if (g != address(0)) {
            m.members[g].loanTies -= 1;
            delete s.guaranteeOf[g];
            _syncFrozen(s, m, g);
        }
        uint256 open = s.settleOf[b];
        if (open != 0) _close(s, m, open, Status.Cancelled);
    }

    /// @dev Frozen exactly while the member's own loan, or the loan they guarantee, is defaulted.
    function _syncFrozen(Store storage s, Membership.Store storage m, address who) private {
        bool f = s.loans[who].defaulted;
        if (!f) {
            address backed = s.guaranteeOf[who];
            f = backed != address(0) && s.loans[backed].defaulted
                && s.loans[backed].guarantor == who;
        }
        Membership.Member storage x = m.members[who];
        if (x.active && x.frozen != f) x.frozen = f;
    }

    /// @dev Uses the borrower's shares at NAV, then the guarantor's, to cover principal, interest
    ///      and fees up to the default month (LOAN-06); writes off any principal left (the loss is
    ///      shared through NAV).
    function _settle(
        Store storage s,
        Membership.Store storage m,
        Ledger.Store storage led,
        Ctx calldata c,
        address b
    ) private {
        Loan storage ln = s.loans[b];
        (uint256 interest, uint256 fees,) = _owed(ln, c.dueDay, ln.defaultPeriod);
        uint256 principalLeft = ln.principal;
        uint256 debt = principalLeft + interest + fees;
        address g = ln.guarantor;
        (uint256 fromB, uint256 pB) = _seize(m, led, b, debt, principalLeft);
        principalLeft -= pB;
        uint256 fromG = 0;
        if (g != address(0) && debt > fromB) {
            uint256 pG;
            (fromG, pG) = _seize(m, led, g, debt - fromB, principalLeft);
            principalLeft -= pG;
        }
        // Whatever principal is still unpaid is lost: assets and loans out both drop.
        led.totalAssets -= principalLeft;
        led.loansOutstanding -= principalLeft;
        emit LoanSettled(b, g, fromB, fromG, principalLeft);
        _closeLoan(s, m, b);
    }

    /// @dev Burns up to `debt` worth of `who`'s shares at the current NAV. The principal part
    ///      cancels the loan against the equity (assets and loans out both drop); the rest is
    ///      interest, which stays in the vault and raises everyone else's NAV.
    function _seize(
        Membership.Store storage m,
        Ledger.Store storage led,
        address who,
        uint256 debt,
        uint256 principalLeft
    ) private returns (uint256 taken, uint256 principalPart) {
        Membership.Member storage x = m.members[who];
        uint256 sh = x.shares;
        if (sh == 0) return (0, 0);
        uint256 ta = led.totalAssets;
        uint256 ts = led.totalShares;
        uint256 value = SharesMath.assetsForShares(sh, ta, ts);
        uint256 burn = sh;
        taken = value;
        if (value > debt) {
            taken = debt;
            burn = Math.mulDiv(
                debt,
                ts + SharesMath.VIRTUAL_SHARES,
                ta + SharesMath.VIRTUAL_ASSETS,
                Math.Rounding.Ceil
            );
            if (burn > sh) burn = sh;
        }
        principalPart = taken < principalLeft ? taken : principalLeft;
        x.shares = SafeCast.toUint128(sh - burn);
        led.totalShares = ts - burn;
        led.totalAssets = ta - principalPart;
        led.loansOutstanding -= principalPart;
    }

    // ------------------------------------------------------------------ interest math

    /// @dev Interest on `principal` for months `from..to` (inclusive), O(1). Free months: up to
    ///      the disbursal month, plus medical months before `disbursedPeriod + freeMonths` (rule
    ///      18, matching packages/rules interest.ts). Tenor i runs `tenorMonths` months from the
    ///      month after disbursal; the third rate stays after the third tenor. Each month rounds
    ///      up, like the TS engine.
    function _span(Loan storage ln, uint256 from, uint256 to, uint256 principal)
        private
        view
        returns (uint256 interest)
    {
        uint256 d = ln.disbursedPeriod;
        uint256 free = d;
        if (ln.medical && ln.freeMonths > 1) free = d + ln.freeMonths - 1;
        if (from <= free) from = free + 1;
        if (from > to) return 0;
        uint256 t = ln.tenorMonths;
        // Tenor 1: d+1 .. d+t; tenor 2: d+t+1 .. d+2t; tenor 3 and after: d+2t+1 onwards.
        interest = _segment(from, to, d + 1, d + t, principal, ln.rate1);
        interest += _segment(from, to, d + t + 1, d + 2 * t, principal, ln.rate2);
        interest += _segment(from, to, d + 2 * t + 1, type(uint256).max, principal, ln.rate3);
    }

    /// @dev Months `from..to` that charge interest (overlap with any segment whose rate > 0).
    function _months(Loan storage ln, uint256 from, uint256 to) private view returns (uint256) {
        return _span(ln, from, to, 1);
    }

    function _segment(
        uint256 from,
        uint256 to,
        uint256 lo,
        uint256 hi,
        uint256 principal,
        uint256 rate
    ) private pure returns (uint256) {
        if (rate == 0) return 0;
        uint256 a = from > lo ? from : lo;
        uint256 b = to < hi ? to : hi;
        if (a > b) return 0;
        return (b - a + 1) * _ceilBps(principal, rate);
    }

    /// @dev principal x rate / 10_000, rounded up (favours the circle).
    function _ceilBps(uint256 principal, uint256 rate) private pure returns (uint256) {
        return Math.mulDiv(principal, rate, BPS, Math.Rounding.Ceil);
    }
}
