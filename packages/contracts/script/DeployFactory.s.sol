// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {CircleFactory} from "../src/CircleFactory.sol";

/// @notice Deploys CircleFactory and records the address for the SDK.
/// @dev Fuji only for now (CircleVault refuses mainnet until exits exist).
///      Usage (from packages/contracts):
///        forge script script/DeployFactory.s.sol --rpc-url fuji --broadcast --private-key $DEPLOYER_PRIVATE_KEY
///      Writes ../sdk/src/deployments/<chainId>.json, which the app reads.
contract DeployFactory is Script {
    function run() external returns (CircleFactory factory) {
        vm.startBroadcast();
        factory = new CircleFactory();
        vm.stopBroadcast();

        string memory obj = "deployment";
        vm.serializeAddress(obj, "circleFactory", address(factory));
        string memory json = vm.serializeUint(obj, "fromBlock", block.number);
        string memory path = string.concat(
            vm.projectRoot(), "/../sdk/src/deployments/", vm.toString(block.chainid), ".json"
        );
        vm.writeJson(json, path);

        console2.log("CircleFactory deployed at", address(factory));
        console2.log("Chain id", block.chainid);
        console2.log("Wrote", path);
    }
}
