// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDT (testnet faucet)
/// @notice Fuji-only stand-in for Tether USDt (ADR 0046): 6 decimals and a public faucet `mint`
///         capped per call, so testers can fund USDT circles. Worthless by design.
/// @dev Never deploy on mainnet: there the factory gets the real USDt address
///      (Avalanche C-Chain `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7`). Refuses chain 43114.
contract MockUSDT is ERC20 {
    /// @notice Most a single `mint` call can create: 10,000 USDT.
    uint256 public constant MINT_CAP = 10_000e6;
    uint256 internal constant AVALANCHE_MAINNET_CHAIN_ID = 43_114;

    error MintAboveCap(uint256 amount, uint256 cap);
    error MainnetNotAllowed();

    constructor() ERC20("Mock Tether USD (testnet)", "USDT") {
        if (block.chainid == AVALANCHE_MAINNET_CHAIN_ID) revert MainnetNotAllowed();
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Faucet: mint up to `MINT_CAP` test USDT to `to`. Anyone can call it.
    function mint(address to, uint256 amount) external {
        if (amount > MINT_CAP) revert MintAboveCap(amount, MINT_CAP);
        _mint(to, amount);
    }
}
