// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice What Reputation needs from the factory: which addresses are real circles.
interface ICircleCheck {
    function isCircle(address circle) external view returns (bool);
}

/// @title Reputation
/// @notice A wallet's track record across every WealthKart circle (PLAN.md D7, Phase 3): months
///         paid on time or late, loans repaid, defaults. Soulbound: one token per wallet, never
///         transferable (ERC-5192 "locked"). Only circles created by the factory can write it.
/// @dev No personal data: the token id is the wallet address. Counters only go up, so a
///      record can't be quietly cleaned. Circles call it after their own state changes (CEI);
///      it makes no external calls besides the factory check.
contract Reputation {
    struct Record {
        uint32 onTime;
        uint32 late;
        uint32 loansRepaid;
        uint32 defaults;
        /// @dev Circles this wallet has a record in (first write from each circle counts once).
        uint32 circles;
        uint64 firstSeen;
        uint64 lastSeen;
    }

    /// @notice The factory whose circles may write records.
    ICircleCheck public immutable factory;

    mapping(address wallet => Record) internal _records;
    mapping(address wallet => mapping(address circle => bool)) public seenIn;

    /// @notice ERC-5192: emitted once per token, which is locked forever.
    event Locked(uint256 tokenId);
    /// @notice ERC-721 mint event, so wallets and explorers can show the token.
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event PaymentRecorded(address indexed wallet, address indexed circle, bool onTime);
    event LoanOutcomeRecorded(address indexed wallet, address indexed circle, bool repaid);

    error NotACircle(address caller);
    error Soulbound();
    error NoRecord(address wallet);

    constructor(address factory_) {
        factory = ICircleCheck(factory_);
    }

    modifier onlyCircle() {
        if (!factory.isCircle(msg.sender)) revert NotACircle(msg.sender);
        _;
    }

    // ------------------------------------------------------------------ writes (circles only)

    /// @notice A circle records one installment: on time (no late fee) or late.
    function recordPayment(address wallet, bool onTime) external onlyCircle {
        Record storage r = _touch(wallet);
        if (onTime) r.onTime += 1;
        else r.late += 1;
        emit PaymentRecorded(wallet, msg.sender, onTime);
    }

    /// @notice A circle records how a loan ended: repaid in full, or a default.
    function recordLoanOutcome(address wallet, bool repaid) external onlyCircle {
        Record storage r = _touch(wallet);
        if (repaid) r.loansRepaid += 1;
        else r.defaults += 1;
        emit LoanOutcomeRecorded(wallet, msg.sender, repaid);
    }

    // ------------------------------------------------------------------ views

    function recordOf(address wallet) external view returns (Record memory) {
        return _records[wallet];
    }

    /// @notice Share of installments paid on time, in basis points (10000 = always on time).
    function onTimeBps(address wallet) external view returns (uint256) {
        Record storage r = _records[wallet];
        uint256 total = uint256(r.onTime) + r.late;
        return total == 0 ? 0 : (uint256(r.onTime) * 10_000) / total;
    }

    // ------------------------------------------------------------------ minimal ERC-721 + ERC-5192

    function name() external pure returns (string memory) {
        return "WealthKart Record";
    }

    function symbol() external pure returns (string memory) {
        return "WKREC";
    }

    function balanceOf(address wallet) external view returns (uint256) {
        // slither-disable-next-line incorrect-equality (0 = no record yet, a sentinel)
        return _records[wallet].firstSeen == 0 ? 0 : 1;
    }

    function ownerOf(uint256 tokenId) external view returns (address wallet) {
        wallet = address(uint160(tokenId));
        // slither-disable-next-line incorrect-equality (0 = no record yet, a sentinel)
        if (_records[wallet].firstSeen == 0) revert NoRecord(wallet);
    }

    /// @notice ERC-5192: every record is locked to its wallet.
    function locked(uint256) external pure returns (bool) {
        return true;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 // ERC-165
            || id == 0x80ac58cd // ERC-721
            || id == 0xb45a3c0e; // ERC-5192
    }

    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function approve(address, uint256) external pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }

    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    // ------------------------------------------------------------------ internals

    function _touch(address wallet) private returns (Record storage r) {
        r = _records[wallet];
        uint64 nowTs = uint64(block.timestamp);
        if (r.firstSeen == 0) {
            r.firstSeen = nowTs;
            uint256 tokenId = uint256(uint160(wallet));
            emit Transfer(address(0), wallet, tokenId);
            emit Locked(tokenId);
        }
        if (!seenIn[wallet][msg.sender]) {
            seenIn[wallet][msg.sender] = true;
            r.circles += 1;
        }
        r.lastSeen = nowTs;
    }
}
