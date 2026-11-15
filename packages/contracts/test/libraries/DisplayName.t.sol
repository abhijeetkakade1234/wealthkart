// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DisplayName} from "../../src/libraries/DisplayName.sol";

contract DisplayNameTest is Test {
    function test_S_MEM_18_allowedCharactersAndLengths() public pure {
        assertTrue(DisplayName.isValid("abc"));
        assertTrue(DisplayName.isValid("Night Owl_2.0-x"));
        assertTrue(DisplayName.isValid("abcdefghijklmnopqrstuvwx")); // 24
        assertFalse(DisplayName.isValid("abcdefghijklmnopqrstuvwxy")); // 25
        assertFalse(DisplayName.isValid("a b!"));
        assertFalse(DisplayName.isValid(""));
    }

    function test_keyIgnoresCase() public pure {
        assertEq(DisplayName.key("NightOwl"), DisplayName.key("nightowl"));
        assertEq(DisplayName.key("Comet_K"), DisplayName.key("COMET_k"));
        assertTrue(DisplayName.key("Owl.") != DisplayName.key("Owl-"));
    }

    /// Any byte outside the allowed set makes the name invalid.
    function testFuzz_S_RT_09_anyDisallowedByteIsRejected(uint8 pos, bytes1 c) public pure {
        bool allowed = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A)
            || (c >= 0x61 && c <= 0x7A) || c == 0x5F || c == 0x2E || c == 0x2D || c == 0x20;
        vm.assume(!allowed);
        bytes memory b = bytes("abcdefgh");
        b[pos % b.length] = c;
        assertFalse(DisplayName.isValid(string(b)));
    }

    /// Changing the case of any letters never changes the key.
    function testFuzz_keyIsCaseInsensitive(uint256 mask) public pure {
        bytes memory lower = bytes("night_owl.2");
        bytes memory mixed = bytes("night_owl.2");
        for (uint256 i = 0; i < mixed.length; ++i) {
            if ((mask >> i) & 1 == 1 && mixed[i] >= 0x61 && mixed[i] <= 0x7A) {
                mixed[i] = bytes1(uint8(mixed[i]) - 32);
            }
        }
        assertEq(DisplayName.key(string(mixed)), DisplayName.key(string(lower)));
    }
}
