// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice A smart-contract wallet member (Safe-like): forwards calls, and refuses plain AVAX.
/// @dev Models members whose wallet can't receive AVAX. Any future payout (exits, loans) must
///      not brick the circle when paid to one of these; pull-over-push is the expected fix.
contract RejectingWallet {
    address public immutable owner;

    error OnlyOwner();
    error NoPlainAvax();

    constructor(address owner_) {
        owner = owner_;
    }

    function exec(address target, uint256 value, bytes calldata data)
        external
        payable
        returns (bytes memory)
    {
        if (msg.sender != owner) revert OnlyOwner();
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }

    receive() external payable {
        revert NoPlainAvax();
    }
}

/// @notice Attacker contract: whenever it receives AVAX it re-enters `target` with `payload`.
///         Records whether the re-entry succeeded so tests can assert it never does.
contract ReentrantAttacker {
    address public target;
    bytes public payload;
    uint256 public reentryValue;
    bool public reentered;
    bool public reentrySucceeded;

    function arm(address target_, bytes calldata payload_, uint256 value_) external {
        target = target_;
        payload = payload_;
        reentryValue = value_;
    }

    function exec(address to, uint256 value, bytes calldata data) external payable {
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    receive() external payable {
        if (reentered || target == address(0)) return;
        reentered = true;
        (reentrySucceeded,) = target.call{value: reentryValue}(payload);
    }
}
