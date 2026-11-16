import { decodeFunctionResult, encodeFunctionData, erc20Abi, type Address } from "viem";

// The SDK package is ESM-only and Playwright loads tests as CommonJS, so read the ABI source.
import { circleFactoryAbi } from "../../../../packages/sdk/src/abi/CircleFactory";
import { circleVaultAbi } from "../../../../packages/sdk/src/abi/CircleVault";
import { call, send } from "./chain";
import { ACCOUNTS, FACTORY_ADDRESS } from "./env";

/** USDT circles (ADR 0046): the faucet MockUSDT that global-setup gave the factory. */

const mintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/** 1 USDT in token units (6 decimals). */
export const USDT_UNIT = 1_000_000n;

/** The factory's USDT token address. */
export async function factoryUsdt(): Promise<Address> {
  const data = encodeFunctionData({ abi: circleFactoryAbi, functionName: "usdt" });
  return decodeFunctionResult({
    abi: circleFactoryAbi,
    functionName: "usdt",
    data: (await call(FACTORY_ADDRESS, data)) as `0x${string}`,
  }) as Address;
}

/** Mints test USDT from the public faucet (capped at 10,000 USDT per call). */
export async function mintUsdt(to: Address, amount: bigint) {
  const token = await factoryUsdt();
  await send({
    from: ACCOUNTS.deployer,
    to: token,
    data: encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [to, amount] }),
  });
}

export async function usdtBalanceOf(who: Address): Promise<bigint> {
  const token = await factoryUsdt();
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [who] });
  return decodeFunctionResult({
    abi: erc20Abi,
    functionName: "balanceOf",
    data: (await call(token, data)) as `0x${string}`,
  });
}

export async function usdtAllowance(owner: Address, spender: Address): Promise<bigint> {
  const token = await factoryUsdt();
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  return decodeFunctionResult({
    abi: erc20Abi,
    functionName: "allowance",
    data: (await call(token, data)) as `0x${string}`,
  });
}

/** A vault view with no arguments that returns an address or number (`asset`, `maxMembers`). */
export async function vaultView(circle: Address, functionName: "asset" | "maxMembers") {
  const data = encodeFunctionData({ abi: circleVaultAbi, functionName });
  return decodeFunctionResult({
    abi: circleVaultAbi,
    functionName,
    data: (await call(circle, data)) as `0x${string}`,
  });
}
