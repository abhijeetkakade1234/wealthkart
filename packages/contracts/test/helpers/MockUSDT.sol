// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only USDT stand-in (contract `TestUSDT`, so it never clashes with the faucet
///         `script/MockUSDT.sol`) (ADR 0046): 6 decimals, open `mint`, plus two switches real
///         tokens can have: a blacklist that freezes an address (Tether's `addBlackList`), and a
///         fee taken on every transfer (fee-on-transfer tokens, which circles must reject).
contract TestUSDT is ERC20 {
    mapping(address account => bool) public blacklisted;
    /// @notice Fee in basis points taken from each transfer and burned (0 = off).
    uint256 public feeBps;

    error Blacklisted(address account);

    constructor() ERC20("Mock Tether USD", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlacklisted(address account, bool on) external {
        blacklisted[account] = on;
    }

    function setFeeBps(uint256 bps) external {
        feeBps = bps;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blacklisted[from]) revert Blacklisted(from);
        if (blacklisted[to]) revert Blacklisted(to);
        uint256 fee = from == address(0) || to == address(0) ? 0 : value * feeBps / 10_000;
        if (fee != 0) super._update(from, address(0), fee);
        super._update(from, to, value - fee);
    }
}
