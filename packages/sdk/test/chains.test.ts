import { describe, expect, it } from "vitest";
import { chainForNetwork, DEPLOYMENTS } from "../src/index.js";

describe("chainForNetwork (S-NET-01, ADR 0051)", () => {
  it("S-NET-01 empty or fuji means Fuji, mainnet means Avalanche, a typo fails loudly", () => {
    expect(chainForNetwork(undefined).id).toBe(43113);
    expect(chainForNetwork("").id).toBe(43113);
    expect(chainForNetwork("fuji").id).toBe(43113);
    expect(chainForNetwork(" Mainnet ").id).toBe(43114);
    expect(() => chainForNetwork("mainet")).toThrow(/Unknown network/);
  });

  it("S-NET-01 both networks have a deployments entry (null until deployed)", () => {
    expect(DEPLOYMENTS[43113]).toBeDefined();
    expect(DEPLOYMENTS[43114]).toBeDefined();
  });
});
