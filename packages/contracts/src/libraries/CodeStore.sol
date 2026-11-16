// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title CodeStore
/// @notice Stores bytes as the code of tiny data contracts and reads them back (the SSTORE2
///         pattern). The factory keeps the vault's creation code here instead of embedding it,
///         so the vault can grow without hitting the factory's 24 KB limit (ADR 0037).
/// @dev Each data contract's code is `0x00 ++ data`: the leading STOP means calling it does
///      nothing. Data contracts have no functions, no owner and can't be changed.
library CodeStore {
    /// @dev Below the 24,576-byte code limit, minus the STOP byte.
    uint256 internal constant CHUNK = 24_000;

    error WriteFailed();

    /// @notice Writes `data` into as many data contracts as needed; returns their addresses.
    function write(bytes memory data) internal returns (address[] memory pointers) {
        uint256 n = (data.length + CHUNK - 1) / CHUNK;
        pointers = new address[](n);
        for (uint256 i = 0; i < n; ++i) {
            uint256 start = i * CHUNK;
            uint256 len = data.length - start < CHUNK ? data.length - start : CHUNK;
            pointers[i] = _deploy(_slice(data, start, len));
        }
    }

    /// @notice Concatenates the data stored at `pointers`, in order.
    function read(address[] memory pointers) internal view returns (bytes memory out) {
        uint256 total;
        for (uint256 i = 0; i < pointers.length; ++i) {
            total += pointers[i].code.length - 1;
        }
        out = new bytes(total);
        uint256 offset;
        for (uint256 i = 0; i < pointers.length; ++i) {
            address p = pointers[i];
            uint256 len = p.code.length - 1;
            // Data-contract code store (ADR 0037): assembly is the only way to CREATE from bytes.
            // solhint-disable-next-line no-inline-assembly
            assembly ("memory-safe") {
                extcodecopy(p, add(add(out, 0x20), offset), 1, len)
            }
            offset += len;
        }
    }

    function _slice(bytes memory data, uint256 start, uint256 len)
        private
        pure
        returns (bytes memory s)
    {
        s = new bytes(len);
        for (uint256 i = 0; i < len; ++i) {
            s[i] = data[start + i];
        }
    }

    /// @dev Creation code that returns `0x00 ++ data` as the new contract's code.
    function _deploy(bytes memory data) private returns (address pointer) {
        bytes memory runtime = abi.encodePacked(hex"00", data);
        // 10-byte prefix: PUSH2 len, DUP1, PUSH1 0x0a, RETURNDATASIZE (0), CODECOPY(0, 0x0a, len),
        // RETURNDATASIZE (0), RETURN(0, len). It copies the runtime that follows and returns it.
        bytes memory creation =
            abi.encodePacked(hex"61", uint16(runtime.length), hex"80600a3d393df3", runtime);
        // Data-contract code store (ADR 0037): assembly is the only way to CREATE from bytes.
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            pointer := create(0, add(creation, 0x20), mload(creation))
        }
        if (pointer == address(0)) revert WriteFailed();
    }
}
