import { describe, expect, it } from "vitest";

import { walletStatusOf } from "../use-core-wallet";

const FUJI = 43_113;
const ETHEREUM = 1;

describe("walletStatusOf", () => {
  it("S-WEB-01 Core not installed shows the install prompt", () => {
    expect(walletStatusOf({ status: "disconnected", chainId: undefined, hasCore: false })).toBe(
      "no-core",
    );
  });

  it("Core installed but not connected asks to connect", () => {
    expect(walletStatusOf({ status: "disconnected", chainId: undefined, hasCore: true })).toBe(
      "disconnected",
    );
  });

  it("S-WEB-02 connected on the wrong network asks to switch", () => {
    expect(walletStatusOf({ status: "connected", chainId: ETHEREUM, hasCore: true })).toBe(
      "wrong-network",
    );
  });

  it("connected on Fuji is ready", () => {
    expect(walletStatusOf({ status: "connected", chainId: FUJI, hasCore: true })).toBe("ready");
  });

  it("reconnecting after reload shows loading, not the connect prompt", () => {
    expect(walletStatusOf({ status: "reconnecting", chainId: FUJI, hasCore: true })).toBe(
      "connecting",
    );
  });
});
