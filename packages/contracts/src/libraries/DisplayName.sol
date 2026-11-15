// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title DisplayName
/// @notice Validation and uniqueness key for self-chosen member display names (ADR 0029).
/// @dev Allowed: 3..24 bytes of [A-Za-z0-9], space, `_`, `.`, `-`. No leading/trailing space and
///      no double spaces, so names that look the same can't both exist. ASCII only on purpose:
///      it rules out emoji, right-to-left marks and zero-width characters (S-MEM-06).
///      Uniqueness is case-insensitive: the key is keccak256 of the lowercased name.
library DisplayName {
    uint256 internal constant MIN_BYTES = 3;
    uint256 internal constant MAX_BYTES = 24;

    bytes1 private constant SPACE = 0x20;

    /// @notice True if `name` follows the rules above.
    function isValid(string memory name) internal pure returns (bool) {
        bytes memory b = bytes(name);
        uint256 len = b.length;
        if (len < MIN_BYTES || len > MAX_BYTES) return false;
        if (b[0] == SPACE || b[len - 1] == SPACE) return false;
        for (uint256 i = 0; i < len; ++i) {
            bytes1 c = b[i];
            if (c == SPACE) {
                if (b[i - 1] == SPACE) return false; // i > 0: first byte isn't a space
                continue;
            }
            bool ok = (c >= 0x30 && c <= 0x39) // 0-9
                || (c >= 0x41 && c <= 0x5A) // A-Z
                || (c >= 0x61 && c <= 0x7A) // a-z
                || c == 0x5F // _
                || c == 0x2E // .
                || c == 0x2D; // -
            if (!ok) return false;
        }
        return true;
    }

    /// @notice Case-insensitive uniqueness key. Call only on a name that passed `isValid`.
    function key(string memory name) internal pure returns (bytes32) {
        bytes memory b = bytes(name);
        bytes memory lower = new bytes(b.length);
        for (uint256 i = 0; i < b.length; ++i) {
            bytes1 c = b[i];
            // A-Z -> a-z; everything else is already canonical.
            lower[i] = (c >= 0x41 && c <= 0x5A) ? bytes1(uint8(c) + 32) : c;
        }
        return keccak256(lower);
    }
}
