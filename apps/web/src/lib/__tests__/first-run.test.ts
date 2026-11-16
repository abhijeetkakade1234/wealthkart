import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checklistItems,
  EMPTY_FIRST_RUN,
  firstRunKey,
  readFirstRun,
  showChecklist,
  writeFirstRun,
} from "@/lib/first-run";

const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("S-ONB-01 first-run checklist state is per wallet and never throws", () => {
  it("starts empty, saves per wallet, and ignores junk", () => {
    expect(readFirstRun(A)).toEqual(EMPTY_FIRST_RUN);
    writeFirstRun(A, { dismissed: true, phrase: true, nominee: false });
    expect(readFirstRun(A).dismissed).toBe(true);
    expect(readFirstRun(A.toLowerCase()).phrase).toBe(true);
    expect(readFirstRun(B)).toEqual(EMPTY_FIRST_RUN);
    window.localStorage.setItem(firstRunKey(B), "{not json");
    expect(readFirstRun(B)).toEqual(EMPTY_FIRST_RUN);
  });

  it("survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readFirstRun(A)).toEqual(EMPTY_FIRST_RUN);
    expect(() => writeFirstRun(A, EMPTY_FIRST_RUN)).not.toThrow();
  });
});

describe("S-ONB-02 checklist items reflect the wallet and link to the guide", () => {
  it("maps chain reads to done, to do, checking and unknown", () => {
    const items = checklistItems({
      hasGas: true,
      inCircle: undefined,
      hasNominee: undefined,
      state: EMPTY_FIRST_RUN,
      testnet: true,
    });
    const by = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(by.gas!.status).toBe("done");
    expect(by.circle!.status).toBe("checking");
    expect(by.phrase!.status).toBe("todo");
    expect(by.nominee!.manual).toBe(false);
    expect(by.nominee!.status).toBe("checking");
    expect(by.gas!.hint).toMatch(/faucet/);
    for (const i of items) expect(i.href).toMatch(/^\/start\/#/);
    const failed = checklistItems({
      hasGas: null,
      inCircle: false,
      hasNominee: null,
      state: EMPTY_FIRST_RUN,
      testnet: false,
    });
    expect(failed.find((i) => i.id === "gas")!.status).toBe("unknown");
    expect(failed.find((i) => i.id === "gas")!.hint).not.toMatch(/faucet/);
  });

  it("hides when dismissed or when everything is done", () => {
    const all = { dismissed: false, phrase: true, nominee: false };
    const done = checklistItems({
      hasGas: true,
      inCircle: true,
      hasNominee: true,
      state: all,
      testnet: true,
    });
    expect(showChecklist(done, all)).toBe(false);
    const fresh = checklistItems({
      hasGas: false,
      inCircle: false,
      hasNominee: false,
      state: EMPTY_FIRST_RUN,
      testnet: true,
    });
    expect(showChecklist(fresh, EMPTY_FIRST_RUN)).toBe(true);
    expect(showChecklist(fresh, { ...EMPTY_FIRST_RUN, dismissed: true })).toBe(false);
  });
});

describe("S-NOM-16 the backup wallet item is read from the chain (ADR 0056)", () => {
  const base = { hasGas: true, state: EMPTY_FIRST_RUN, testnet: true };
  const item = (x: Parameters<typeof checklistItems>[0]) =>
    checklistItems(x).find((i) => i.id === "nominee")!;

  it("is done only when every circle has one, and can't be ticked by hand", () => {
    expect(item({ ...base, inCircle: true, hasNominee: true }).status).toBe("done");
    expect(item({ ...base, inCircle: true, hasNominee: false }).status).toBe("todo");
    expect(item({ ...base, inCircle: true, hasNominee: null }).status).toBe("unknown");
    expect(item({ ...base, inCircle: true, hasNominee: true }).manual).toBe(false);
    // An old self-tick no longer counts.
    const ticked = { ...EMPTY_FIRST_RUN, nominee: true };
    expect(item({ ...base, inCircle: true, hasNominee: false, state: ticked }).status).toBe("todo");
  });

  it("before joining a circle it explains where to set it", () => {
    const i = item({ ...base, inCircle: false, hasNominee: undefined });
    expect(i.status).toBe("todo");
    expect(i.hint).toMatch(/circle's page/);
  });
});
