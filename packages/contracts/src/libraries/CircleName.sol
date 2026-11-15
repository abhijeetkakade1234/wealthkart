// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title CircleName
/// @notice Validation for circle names (ADR 0033, red-team RT-26).
/// @dev Allowed: 3..48 bytes of [A-Za-z0-9], space, `_`, `-`, `'`, `&`. No leading/trailing space
///      and no double spaces. No dots, colons or slashes, so a name can never carry a link or a
///      domain ("Claim refund: wealthkart-help.app") into portfolios and switchers.
library CircleName {
    uint256 internal constant MIN_BYTES = 3;
    uint256 internal constant MAX_BYTES = 48;

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
                || c == 0x2D // -
                || c == 0x27 // '
                || c == 0x26; // &
            if (!ok) return false;
        }
        return true;
    }
}
