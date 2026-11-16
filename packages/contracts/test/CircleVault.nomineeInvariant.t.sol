// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {Membership} from "../src/modules/Membership.sol";
import {Exits} from "../src/modules/Exits.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";

/// @dev Directed handler for nominee claims (ADR 0056): members go absent and come back, are
///      voted dormant, name nominees (members or an outsider heir), and claims are asked for,
///      voted either way, cancelled, woken from, paid out and mixed with normal exits.
contract NomineeHandler is Test {
    CircleVault public vault;
    address[] public members;
    address public heir;
    mapping(address => bool) public absent;

    uint256 public ghostClaims;
    uint256 public ghostQueued;
    uint256 public ghostPaidToNominee;

    constructor(CircleVault v, address[] memory m, address heir_) {
        vault = v;
        members = m;
        heir = heir_;
    }

    function _m(uint256 i) internal view returns (address) {
        return members[i % members.length];
    }

    function _try(address who, bytes memory data) internal returns (bool ok) {
        vm.prank(who);
        (ok,) = address(vault).call(data);
    }

    function _payIfDue(address a) internal {
        if (!vault.isMember(a)) return;
        (, uint256 amount,, bool due) = vault.amountDue(a);
        if (!due) return;
        vm.deal(a, a.balance + amount);
        vm.prank(a);
        vault.contribute{value: amount}();
    }

    /// @dev Everyone present and not dormant pays what is due.
    function payRound() external {
        for (uint256 i = 0; i < members.length; ++i) {
            address a = members[i];
            if (absent[a] || !vault.isMember(a) || vault.memberOf(a).dormant) continue;
            _payIfDue(a);
        }
    }

    /// @dev One member pays (a dormant one is woken and any claim ends).
    function pay(uint256 who) external {
        _payIfDue(_m(who));
    }

    function toggleAbsent(uint256 who) external {
        address a = _m(who);
        absent[a] = !absent[a];
    }

    function warp(uint256 secondsAhead) external {
        vm.warp(block.timestamp + bound(secondsAhead, 1 days, 25 days));
    }

    /// @dev Proposes the first member from `target` on who can be voted dormant; all vote yes.
    function dormantVote(uint256 target) external {
        uint256 id;
        address t;
        for (uint256 k = 0; k < members.length && id == 0; ++k) {
            t = _m(target + k);
            for (uint256 i = 0; i < members.length; ++i) {
                if (_try(members[i], abi.encodeCall(CircleVault.proposeDormant, (t)))) break;
            }
            id = vault.openDormantOf(t);
        }
        if (id == 0) return;
        for (uint256 i = 0; i < members.length; ++i) {
            if (vault.canVote(id, members[i])) {
                _try(members[i], abi.encodeCall(CircleVault.vote, (id, true)));
            }
        }
    }

    function setNominee(uint256 who, uint256 nom) external {
        address n = nom % 3 == 0 ? heir : _m(nom);
        _try(_m(who), abi.encodeCall(CircleVault.setNominee, (n)));
    }

    /// @dev The nominee asks; each voter votes yes or no by `seed`'s bits.
    function claim(uint256 target, uint256 seed) external {
        address t;
        bool opened;
        for (uint256 k = 0; k < members.length && !opened; ++k) {
            t = _m(target + k);
            address n = vault.nomineeOf(t);
            if (n == address(0)) continue;
            opened = _try(n, abi.encodeCall(CircleVault.requestNomineeClaim, (t)));
        }
        if (!opened) return;
        ++ghostClaims;
        (uint256 id,) = vault.nomineeClaimOf(t);
        for (uint256 i = 0; i < members.length; ++i) {
            if (!vault.canVote(id, members[i])) continue;
            _try(
                members[i],
                abi.encodeCall(CircleVault.vote, (id, (seed >> i) & 1 == 1 || seed % 4 != 0))
            );
        }
        (, address payTo) = vault.nomineeClaimOf(t);
        if (payTo != address(0)) ++ghostQueued;
    }

    function finalizeAll() external {
        uint256 n = vault.openRequestCount();
        if (n == 0) return;
        (uint256[] memory ids,) = vault.openRequestsPage(0, n);
        for (uint256 i = 0; i < ids.length; ++i) {
            address subject = vault.getRequest(ids[i]).account;
            (, address before) = vault.nomineeClaimOf(subject);
            (bool ok,) = address(vault).call(abi.encodeCall(CircleVault.finalize, (ids[i])));
            (, address afterPay) = vault.nomineeClaimOf(subject);
            if (ok && before == address(0) && afterPay != address(0)) ++ghostQueued;
        }
    }

    function cancelClaim(uint256 who) external {
        _try(_m(who), abi.encodeCall(CircleVault.cancelNomineeClaim, ()));
    }

    function wake(uint256 who) external {
        _try(_m(who), abi.encodeCall(CircleVault.wake, ()));
    }

    function requestExit(uint256 who) external {
        _try(_m(who), abi.encodeCall(CircleVault.requestExit, ()));
    }

    function processExits() external {
        uint256 hb = heir.balance;
        vault.processExits(10);
        if (heir.balance > hb) ++ghostPaidToNominee;
    }
}

/// @notice Invariants with nominee claims in the mix (ADR 0056): solvency (I-12), shares (I-2),
///         the exit queue and flags (I-13), and claim state (I-14).
contract CircleVaultNomineeInvariantTest is CircleVaultBase {
    NomineeHandler internal handler;
    address[] internal six;
    address internal heir;

    function _cfg() internal pure override returns (CircleVault.Config memory c) {
        c = super._cfg();
        c.dormantAfter = 1; // fast dormancy so claims happen often
    }

    function setUp() public override {
        super.setUp();
        heir = _actor("heir");
        six = new address[](6);
        for (uint256 i = 0; i < 6; ++i) {
            six[i] = members[i];
        }
        vault = _createCircle(_cfg(), six);
        handler = new NomineeHandler(vault, six, heir);
        targetContract(address(handler));
    }

    function invariant_I12_solventWithNomineePayouts() public view {
        uint256 owed = vault.withdrawable(heir);
        for (uint256 i = 0; i < six.length; ++i) {
            owed += vault.withdrawable(six[i]);
        }
        assertGe(address(vault).balance, vault.totalAssets() - vault.loansOutstanding() + owed);
    }

    function invariant_I2_sharesSumToTotal() public view {
        uint256 sum;
        for (uint256 i = 0; i < six.length; ++i) {
            Membership.Member memory m = vault.memberOf(six[i]);
            if (!m.active) assertEq(m.shares, 0);
            sum += m.shares;
        }
        assertEq(sum, vault.totalShares());
    }

    function invariant_I13_queueFlagsAndQuorumBase() public view {
        uint256 n = vault.exitQueueLength();
        address[] memory page = vault.exitQueuePage(0, n + 1);
        assertEq(page.length, n);
        address prev = address(0);
        uint256 waiting;
        for (uint256 i = 0; i < n; ++i) {
            Exits.Entry memory e = vault.exitOf(page[i]);
            assertEq(e.prev, prev);
            assertTrue(vault.memberOf(page[i]).exiting);
            if (e.waiting) ++waiting;
            prev = page[i];
        }
        assertEq(vault.exitsWaiting(), waiting);
        uint256 flagged;
        uint256 voters;
        uint256 dormant;
        for (uint256 i = 0; i < six.length; ++i) {
            Membership.Member memory m = vault.memberOf(six[i]);
            if (m.exiting) ++flagged;
            if (m.active && m.dormant) ++dormant;
            if (m.active && m.voter && !m.dormant && !m.exiting) ++voters;
        }
        assertEq(flagged, n);
        assertEq(vault.voterCount(), voters);
        assertEq(vault.dormantCount(), dormant);
    }

    function invariant_I14_claimStateIsConsistent() public view {
        for (uint256 i = 0; i < six.length; ++i) {
            address a = six[i];
            (uint256 id, address payTo) = vault.nomineeClaimOf(a);
            if (id != 0) {
                Membership.Request memory r = vault.getRequest(id);
                assertEq(uint8(r.kind), uint8(Membership.Kind.Claim));
                assertEq(uint8(r.status), uint8(Membership.Status.Open));
                assertEq(r.account, a);
                assertEq(r.invitedBy, vault.nomineeOf(a), "claimant is the current nominee");
                assertTrue(vault.memberOf(a).dormant);
                assertEq(payTo, address(0));
                assertLe(r.yes + r.no, r.eligible);
            }
            if (payTo != address(0)) {
                assertGt(vault.exitOf(a).requestedAt, 0);
                assertTrue(vault.memberOf(a).dormant);
                assertEq(payTo, vault.nomineeOf(a), "payee is the nominee that asked");
            }
            if (!vault.isMember(a)) assertEq(vault.nomineeOf(a), address(0));
        }
    }

    /// @dev Coverage guard for the handler itself: a fixed walk reaches a claim, a pass and a
    ///      payout to the heir, so the random runs above can reach them too.
    function test_S_NOM_15_handlerReachesClaimsAndPayouts() public {
        handler.setNominee(5, 0); // members[5] names the heir
        handler.payRound();
        handler.toggleAbsent(5);
        for (uint256 i = 0; i < 3; ++i) {
            handler.warp(25 days);
            handler.payRound();
        }
        handler.dormantVote(5);
        assertTrue(vault.memberOf(six[5]).dormant);
        handler.claim(5, type(uint256).max);
        assertEq(handler.ghostClaims(), 1);
        assertEq(handler.ghostQueued(), 1);
        handler.warp(25 days);
        handler.warp(25 days);
        handler.processExits();
        assertEq(handler.ghostPaidToNominee(), 1);
        invariant_I12_solventWithNomineePayouts();
        invariant_I13_queueFlagsAndQuorumBase();
        invariant_I14_claimStateIsConsistent();
    }
}
