// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployFactory} from "../script/DeployFactory.s.sol";

/// @notice The network is chosen at deploy time (ADR 0050, RT-USDT-06): on Avalanche mainnet
///         the script refuses to run without `CONFIRM_MAINNET=yes` and with any USDT other than
///         C-Chain USDt. Only the refusing paths run here (they revert before writing a file).
contract DeployFactoryTest is Test {
    address internal constant MAINNET_USDT = 0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7;

    /// @dev One test on purpose: environment variables are process-wide and tests run in
    ///      parallel, so the cases run in sequence here.
    function test_S_DEPLOY_01_mainnetNeedsConfirmationAndRealUsdt() public {
        DeployFactory script = new DeployFactory();
        vm.chainId(43_114);
        vm.setEnv("DEPLOY_MOCK_USDT", "false");

        // No confirmation, or anything but the exact word: refused.
        vm.setEnv("USDT_ADDRESS", vm.toString(MAINNET_USDT));
        vm.setEnv("CONFIRM_MAINNET", "");
        vm.expectRevert(DeployFactory.MainnetNotConfirmed.selector);
        script.run();
        vm.setEnv("CONFIRM_MAINNET", "true");
        vm.expectRevert(DeployFactory.MainnetNotConfirmed.selector);
        script.run();

        // Confirmed, but a USDT that isn't C-Chain USDt: refused (no longer just a warning).
        vm.setEnv("CONFIRM_MAINNET", "yes");
        address fake = makeAddr("fakeUsdt");
        vm.setEnv("USDT_ADDRESS", vm.toString(fake));
        vm.expectRevert(abi.encodeWithSelector(DeployFactory.WrongMainnetUsdt.selector, fake));
        script.run();

        // The faucet token never goes to mainnet.
        vm.setEnv("USDT_ADDRESS", vm.toString(address(0)));
        vm.setEnv("DEPLOY_MOCK_USDT", "true");
        vm.expectRevert(DeployFactory.MockUsdtOnMainnet.selector);
        script.run();
        vm.setEnv("DEPLOY_MOCK_USDT", "false");
        vm.setEnv("CONFIRM_MAINNET", "");
    }
}
