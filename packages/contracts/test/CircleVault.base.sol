// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {Rules} from "../src/modules/Rules.sol";
import {PeriodMath} from "../src/libraries/PeriodMath.sol";
import {RejectingWallet, ReentrantAttacker} from "./helpers/Actors.sol";

/// @notice Scenario harness (docs/testing.md): a 12-member circle created on 2026-12-01 00:00 UTC
///         with G1-like defaults (0.5 AVAX due on the 10th, fees 0.01 + 0.01, 3 holidays a year,
///         48 h join votes at 50% quorum, member cap 50), plus named actors and helpers for time,
///         payments, join requests and votes. members[0] created it; the other 11 accepted.
/// @dev Actors:
///      - `honest`   members[0]: pays on time.
///      - `late`     members[1]: pays after the due day.
///      - `outsider` funded EOA that isn't a member.
///      - `attacker` funded EOA that tries to break rules.
///      - `smartWallet()` / `attackerContract()` deploy contract-wallet actors on demand.
abstract contract CircleVaultBase is Test {
    uint256 internal constant AVAX = 1e18;
    uint256 internal constant DEC_1_2026 = 1_796_083_200; // 2026-12-01T00:00:00Z
    uint256 internal constant DEC_10_2026_END = 1_796_947_199; // 2026-12-10T23:59:59Z
    uint256 internal constant DEC_20_2026_END = 1_797_811_199; // 2026-12-20T23:59:59Z
    uint256 internal constant DEC_2026 = 24_323;
    uint256 internal constant FUNDS = 1000 * AVAX;
    /// @dev CircleVault storage slots (`forge inspect CircleVault storageLayout`), used by tests
    ///      that set module switches with `vm.store`. The reentrancy lock is transient, so
    ///      `name` is slot 0. `test_S_RT_LAYOUT` fails loudly if any of these move.
    uint256 internal constant SLOT_MEMBERS = 1; // _m.members (first field of Membership.Store)
    uint256 internal constant SLOT_LEDGER = 23; // _ledger.totalAssets
    uint256 internal constant SLOT_LOANS_OUTSTANDING = SLOT_LEDGER + 2;
    uint256 internal constant SLOT_EXITS_WAITING = SLOT_LEDGER + 5;
    uint256 internal constant SLOT_SWITCHES = SLOT_LEDGER + 6; // pausedUntil|rageQuitUntil|...
    uint256 internal constant SLOT_TOKEN = SLOT_LEDGER + 7; // _ledger.token (ADR 0046)
    uint256 internal constant SLOT_RULES = 31;
    uint256 internal constant SLOT_GOV = 33;
    uint256 internal constant SLOT_EXITS = 44;
    uint256 internal constant SLOT_LOANS = 47;
    string internal constant NAME_RULE =
        "name must be 3..48 letters, digits, spaces or _-'& (no links)";

    CircleFactory internal factory;
    CircleVault internal vault;
    address[] internal members;

    address internal honest;
    address internal late;
    address internal outsider;
    address internal attacker;

    // ------------------------------------------------------------------ setup

    function _cfg() internal pure virtual returns (CircleVault.Config memory c) {
        c = CircleVault.Config({
            name: "College Gang",
            asset: CircleVault.Asset.AVAX,
            installment: uint128(AVAX / 2),
            fee1: uint128(AVAX / 100),
            fee2: uint128(AVAX / 100),
            dueDay: 10,
            secondFeeDay: 20,
            holidaysPerYear: 3,
            votingWindow: 48 hours,
            quorumPct: 50,
            maxMembers: 50,
            dormantAfter: 3,
            minPaidToVote: 2,
            rules: Rules.defaults(uint128(AVAX / 2))
        });
    }

    function setUp() public virtual {
        vm.warp(DEC_1_2026);
        factory = new CircleFactory(type(CircleVault).creationCode, address(0));
        members = _makeMembers(12);
        vault = _createCircle(_cfg(), members);
        honest = members[0];
        late = members[1];
        outsider = _actor("outsider");
        attacker = _actor("attacker");
    }

    // ------------------------------------------------------------------ actors

    function _actor(string memory label) internal returns (address a) {
        a = makeAddr(label);
        vm.deal(a, FUNDS);
    }

    function _makeMembers(uint256 n) internal returns (address[] memory list) {
        list = new address[](n);
        for (uint256 i = 0; i < n; ++i) {
            list[i] = _actor(string.concat("member", vm.toString(i)));
        }
    }

    /// @dev A Safe-like wallet owned by `owner` that refuses plain AVAX.
    function _smartWallet(address owner) internal returns (RejectingWallet w) {
        w = new RejectingWallet(owner);
        vm.label(address(w), "smartWallet");
        vm.deal(address(w), FUNDS);
    }

    function _attackerContract() internal returns (ReentrantAttacker a) {
        a = new ReentrantAttacker();
        vm.label(address(a), "attackerContract");
        vm.deal(address(a), FUNDS);
    }

    /// @dev founders[0] creates the circle and invites the rest; every invitee accepts.
    function _createCircle(CircleVault.Config memory cfg, address[] memory founders)
        internal
        returns (CircleVault v)
    {
        v = _createCircleNoAccept(cfg, founders);
        for (uint256 i = 1; i < founders.length; ++i) {
            vm.prank(founders[i]);
            v.acceptInvite();
        }
    }

    /// @dev founders[0] creates the circle; the others stay invited.
    function _createCircleNoAccept(CircleVault.Config memory cfg, address[] memory founders)
        internal
        returns (CircleVault v)
    {
        address[] memory invitees = new address[](founders.length - 1);
        for (uint256 i = 1; i < founders.length; ++i) {
            invitees[i - 1] = founders[i];
        }
        vm.prank(founders[0]);
        v = CircleVault(payable(factory.createCircle(cfg, invitees)));
    }

    // ------------------------------------------------------------------ time (UTC)

    /// @dev Warp to a UTC date and time.
    function _warpTo(uint256 y, uint256 m, uint256 d, uint256 hh, uint256 mm, uint256 ss) internal {
        vm.warp(PeriodMath.daysFromCivil(y, m, d) * 1 days + hh * 1 hours + mm * 1 minutes + ss);
    }

    /// @dev The next due moment (23:59:59 UTC on the due day) at or after now.
    function _nextDueMoment(CircleVault v) internal view returns (uint256 t) {
        uint256 p = PeriodMath.periodOf(block.timestamp);
        t = PeriodMath.dueMoment(p, v.dueDay());
        if (t < block.timestamp) t = PeriodMath.dueMoment(p + 1, v.dueDay());
    }

    // ------------------------------------------------------------------ payments

    function _pay(address who) internal returns (uint256 sent) {
        return _payIn(vault, who);
    }

    function _payIn(CircleVault v, address who) internal returns (uint256 sent) {
        (,,, bool payable_) = v.amountDue(who);
        require(payable_, "nothing due");
        (, sent,,) = v.amountDue(who);
        vm.prank(who);
        v.contribute{value: sent}();
    }

    // ------------------------------------------------------------------ membership

    function _request(address applicant, string memory displayName) internal returns (uint256 id) {
        vm.prank(applicant);
        id = vault.requestToJoin(displayName, honest);
    }

    /// @dev Members `from..to-1` vote `support`, skipping anyone who can no longer vote.
    function _votes(uint256 id, uint256 from, uint256 to, bool support) internal {
        for (uint256 i = from; i < to; ++i) {
            if (!vault.canVote(id, members[i])) continue;
            vm.prank(members[i]);
            vault.vote(id, support);
        }
    }

    /// @dev Full happy path: request (invited by `honest`), enough yes votes to pass.
    function _admit(address applicant, string memory displayName) internal returns (uint256 id) {
        id = _request(applicant, displayName);
        _votes(id, 0, members.length, true);
        require(vault.isMember(applicant), "not admitted");
    }
}
