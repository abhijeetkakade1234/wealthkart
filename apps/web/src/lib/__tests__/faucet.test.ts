import { describe, expect, it } from "vitest";

import {
  FAUCET_AMOUNT,
  TESTNET_CHAIN_ID,
  faucetMintAmount,
  testUsdtFaucetVisible,
} from "@/lib/faucet";

const USDT = "0x9A676e781A523b5d0C0e43731313A708CB607508";
const CAP = 10_000n * 10n ** 6n;
const testnet = { network: "fuji", chainId: TESTNET_CHAIN_ID, usdt: USDT, mintCap: CAP };

describe("S-USDT-11 the Get test USDT button shows only on a test network faucet token", () => {
  it("shows on a Fuji build (or an empty NEXT_PUBLIC_NETWORK) whose USDT is the faucet", () => {
    expect(testUsdtFaucetVisible(testnet)).toBe(true);
    expect(testUsdtFaucetVisible({ ...testnet, network: undefined })).toBe(true);
    expect(testUsdtFaucetVisible({ ...testnet, network: " FUJI " })).toBe(true);
  });

  it("never shows on a mainnet build, whatever the chain or token says", () => {
    expect(testUsdtFaucetVisible({ ...testnet, network: "mainnet" })).toBe(false);
    expect(testUsdtFaucetVisible({ ...testnet, network: "Mainnet" })).toBe(false);
    expect(testUsdtFaucetVisible({ ...testnet, network: "mainnet", chainId: 43114 })).toBe(false);
  });

  it("hides when the build targets another chain", () => {
    expect(testUsdtFaucetVisible({ ...testnet, chainId: 43114 })).toBe(false);
    expect(testUsdtFaucetVisible({ ...testnet, chainId: 1 })).toBe(false);
  });

  it("hides when the factory has no USDT", () => {
    expect(testUsdtFaucetVisible({ ...testnet, usdt: null })).toBe(false);
    expect(testUsdtFaucetVisible({ ...testnet, usdt: undefined })).toBe(false);
    expect(
      testUsdtFaucetVisible({ ...testnet, usdt: "0x0000000000000000000000000000000000000000" }),
    ).toBe(false);
  });

  it("hides when the token has no faucet (MINT_CAP unread, failed or zero)", () => {
    expect(testUsdtFaucetVisible({ ...testnet, mintCap: undefined })).toBe(false);
    expect(testUsdtFaucetVisible({ ...testnet, mintCap: 0n })).toBe(false);
  });
});

describe("faucetMintAmount", () => {
  it("asks for 1,000 USDT, or the per-call cap when that is lower", () => {
    expect(FAUCET_AMOUNT).toBe(1_000_000_000n);
    expect(faucetMintAmount(CAP)).toBe(FAUCET_AMOUNT);
    expect(faucetMintAmount(500n * 10n ** 6n)).toBe(500n * 10n ** 6n);
  });
});
