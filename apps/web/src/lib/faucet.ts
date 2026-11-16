/**
 * "Get test USDT" (ADR 0053): the testnet faucet token `script/MockUSDT.sol` has a public `mint`
 * capped per call (`MINT_CAP`). The button only ever shows on a test network build, so
 * nobody mistakes test money for real money. Pure rules here; the hook is `use-test-usdt.ts`.
 */

/** Fuji's chain id. The local anvil chain (E2E, `pnpm dev:local`) uses it too. */
export const TESTNET_CHAIN_ID = 43113;

/** How much one tap asks for: 1,000 test USDT (6 decimals). */
export const FAUCET_AMOUNT = 1_000n * 10n ** 6n;

const ZERO = "0x0000000000000000000000000000000000000000";

/** The faucet token's own functions (the real USDt has neither). */
export const faucetAbi = [
  {
    type: "function",
    name: "MINT_CAP",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
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

export interface FaucetFacts {
  /** `NEXT_PUBLIC_NETWORK` of this build. */
  network: string | undefined;
  /** The chain this build targets (`TARGET_CHAIN.id`). */
  chainId: number;
  /** `factory.usdt()`, or null/zero when the factory has no USDT. */
  usdt: string | null | undefined;
  /** The token's `MINT_CAP()`; undefined while loading or when the token has no faucet. */
  mintCap: bigint | undefined;
}

/**
 * Show the button only when every one holds: the build isn't mainnet, it targets Fuji (or the
 * local chain that pretends to be Fuji), the factory has a USDT token, and that token answers
 * `MINT_CAP()` with more than zero (so it is the faucet token, not real USDt).
 */
export function testUsdtFaucetVisible(f: FaucetFacts): boolean {
  if ((f.network ?? "").trim().toLowerCase() === "mainnet") return false;
  if (f.chainId !== TESTNET_CHAIN_ID) return false;
  if (!f.usdt || f.usdt.toLowerCase() === ZERO) return false;
  return f.mintCap !== undefined && f.mintCap > 0n;
}

/** One tap's amount: 1,000 test USDT, or the token's per-call cap if that is lower. */
export function faucetMintAmount(mintCap: bigint): bigint {
  return mintCap < FAUCET_AMOUNT ? mintCap : FAUCET_AMOUNT;
}
