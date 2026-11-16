// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Deploy logs are the point of a script. solhint-disable-next-line is too noisy here.
// solhint-disable no-console

import {Script, console2} from "forge-std/Script.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {MockUSDT} from "./MockUSDT.sol";

/// @notice Deploys CircleFactory and records the address for the SDK.
/// @dev The network is chosen here, not in the contracts (ADR 0050). Fuji (43113) and anvil need
///      nothing extra. Avalanche mainnet (43114) reverts unless `CONFIRM_MAINNET=yes` is set and
///      `USDT_ADDRESS` is the C-Chain USDt below or unset (AVAX-only factory).
///      Usage (from packages/contracts):
///        forge script script/DeployFactory.s.sol --rpc-url fuji --broadcast --private-key $DEPLOYER_PRIVATE_KEY
///      Writes ../sdk/src/deployments/<chainId>.json, which the app reads.
///
///      USDT circles (ADR 0046): the factory takes one USDT address, fixed for its lifetime.
///      - `USDT_ADDRESS` set: that token is used (mainnet: Avalanche C-Chain USDt
///        0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7; the contracts never hardcode it).
///      - `DEPLOY_MOCK_USDT=true` on a testnet (Fuji): deploys `script/MockUSDT.sol` first, a
///        worthless 6-decimal token with a public faucet `mint` capped per call, and uses it.
///      - Neither: address(0), so only AVAX circles can be created on this factory.
contract DeployFactory is Script {
    uint256 internal constant AVALANCHE_MAINNET_CHAIN_ID = 43_114;
    /// @dev Avalanche C-Chain USDt, for the record (pass it with `USDT_ADDRESS`).
    address internal constant MAINNET_USDT = 0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7;

    error MockUsdtOnMainnet();
    /// @notice Mainnet needs `CONFIRM_MAINNET=yes` in the environment.
    error MainnetNotConfirmed();
    /// @notice On mainnet the factory's USDT must be C-Chain USDt (or none).
    error WrongMainnetUsdt(address usdt);

    function run() external returns (CircleFactory factory) {
        address usdt = vm.envOr("USDT_ADDRESS", address(0));
        bool mock = vm.envOr("DEPLOY_MOCK_USDT", false);
        if (block.chainid == AVALANCHE_MAINNET_CHAIN_ID) {
            if (mock) revert MockUsdtOnMainnet();
            if (keccak256(bytes(vm.envOr("CONFIRM_MAINNET", string("")))) != keccak256("yes")) {
                revert MainnetNotConfirmed();
            }
            if (usdt != address(0) && usdt != MAINNET_USDT) revert WrongMainnetUsdt(usdt);
        }

        vm.startBroadcast();
        if (usdt == address(0) && mock) usdt = address(new MockUSDT());
        factory = new CircleFactory(type(CircleVault).creationCode, usdt);
        vm.stopBroadcast();

        string memory obj = "deployment";
        vm.serializeAddress(obj, "circleFactory", address(factory));
        vm.serializeAddress(obj, "usdt", usdt);
        string memory json = vm.serializeUint(obj, "fromBlock", block.number);
        string memory path = string.concat(
            vm.projectRoot(), "/../sdk/src/deployments/", vm.toString(block.chainid), ".json"
        );
        vm.writeJson(json, path);

        console2.log("CircleFactory deployed at", address(factory));
        console2.log("USDT (0 = AVAX only)", usdt);
        console2.log("Chain id", block.chainid);
        console2.log("Wrote", path);
    }
}
