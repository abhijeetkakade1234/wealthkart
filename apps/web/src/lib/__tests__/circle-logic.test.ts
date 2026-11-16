import { describe, expect, it } from "vitest";

import { formatTimeLeft } from "@/components/app/countdown-utc";
import { pageWindow } from "@/components/app/pagination";
import { parseCircleId } from "@/lib/circle";
import { circleNameProblem, DEFAULTS, validate } from "@/lib/circle-form";
import { parseAddress, recordSummary } from "@/lib/record";

const SELF = "0x1111111111111111111111111111111111111111" as const;
const FRIEND = "0x2222222222222222222222222222222222222222";

describe("create-circle validation (mirrors ADR 0022 bounds)", () => {
  it("accepts G1 defaults with a name and adds the creator as a founder", () => {
    const v = validate({ ...DEFAULTS, name: "College Gang", founders: FRIEND }, SELF);
    expect(v.ok).toBe(true);
    expect(v.founders).toEqual([SELF, FRIEND]);
    expect(v.cfg?.installment).toBe(500_000_000_000_000_000n);
  });

  it("S-LIFE-10 rejects out-of-range settings with plain messages", () => {
    const v = validate(
      {
        ...DEFAULTS,
        name: "",
        installment: "0",
        dueDay: "31",
        secondFeeDay: "5",
        holidays: "13",
        dormantAfter: "0",
      },
      SELF,
    );
    expect(v.ok).toBe(false);
    expect(v.errors.name).toBe("Give the circle a name.");
    expect(v.errors.installment).toMatch(/above 0/);
    expect(v.errors.dueDay).toBe("Pick a day from 1 to 28.");
    expect(v.errors.secondFeeDay).toMatch(/after the due day/);
    expect(v.errors.holidays).toBe("Pick 0 to 12.");
    expect(v.errors.dormantAfter).toBe("Pick 1 to 12.");
  });

  it("rejects bad addresses and de-duplicates founders", () => {
    expect(validate({ ...DEFAULTS, name: "x", founders: "0xnope" }, SELF).errors.founders).toMatch(
      /isn't a wallet address/,
    );
    const v = validate(
      {
        ...DEFAULTS,
        name: "x",
        founders: `${FRIEND}\n${FRIEND.toUpperCase().replace("0X", "0x")}\n${SELF}`,
      },
      SELF,
    );
    expect(v.founders).toHaveLength(2);
  });

  it("rejects names over 48 characters and anything outside plain ASCII (RT-26)", () => {
    expect(validate({ ...DEFAULTS, name: "a".repeat(49) }, SELF).errors.name).toMatch(/48/);
    expect(validate({ ...DEFAULTS, name: "ü".repeat(5) }, SELF).errors.name).toMatch(/Use only/);
  });
});

describe("pagination window (S-WEB-12/15)", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("collapses the middle with gaps", () => {
    expect(pageWindow(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 19, 20]);
  });
});

describe("countdown text (S-WEB-11)", () => {
  it("formats time left and overdue time", () => {
    expect(formatTimeLeft(2 * 86_400 + 4 * 3600 + 120)).toBe("2d 4h left");
    expect(formatTimeLeft(3 * 3600 + 12 * 60)).toBe("3h 12m left");
    expect(formatTimeLeft(-(86_400 + 2 * 3600))).toBe("overdue by 1d 2h");
  });
});

describe("circle id from the URL", () => {
  it("accepts addresses and rejects anything else", () => {
    expect(parseCircleId(FRIEND)).toBe(FRIEND);
    expect(parseCircleId("abc")).toBeNull();
    expect(parseCircleId(null)).toBeNull();
    expect(parseCircleId("<script>")).toBeNull();
  });
});

describe("circle switcher (S-WEB-25)", () => {
  it("keeps you on the same circle page when switching", async () => {
    const { switchHref } = await import("@/components/app/circle-switcher");
    expect(switchHref("/app/circle/pay/", FRIEND)).toBe(`/app/circle/pay/?id=${FRIEND}`);
    expect(switchHref("/app/circle", FRIEND)).toBe(`/app/circle/?id=${FRIEND}`);
    expect(switchHref("/app/", FRIEND)).toBe(`/app/circle/?id=${FRIEND}`);
    expect(switchHref("/app/new/", FRIEND)).toBe(`/app/circle/?id=${FRIEND}`);
  });
});

describe("create-circle settings added for membership (ADR 0028, 0030)", () => {
  it("S-RT-33 rejects a late fee above half the installment", () => {
    const v = validate({ ...DEFAULTS, name: "x", installment: "0.5", fee1: "0.26" }, SELF);
    expect(v.errors.fee1).toMatch(/half/);
    expect(validate({ ...DEFAULTS, name: "x", fee1: "0.25" }, SELF).errors.fee1).toBeUndefined();
  });

  it("S-RT-03 sends friends as invitees, never the creator", () => {
    const v = validate({ ...DEFAULTS, name: "x", founders: `${FRIEND}\n${SELF}` }, SELF);
    expect(v.invitees).toEqual([FRIEND]);
    expect(v.cfg?.quorumPct).toBe(50);
    expect(v.cfg?.votingWindow).toBe(172_800);
  });
});

describe("circle names and voting rights (ADR 0033)", () => {
  it("S-RT-34 circle names can't carry links or domains", () => {
    for (const bad of [
      "Claim refund: wealthkart-help.app",
      "www.core-support",
      "https://evil",
      "Core Support.io",
    ]) {
      expect(circleNameProblem(bad), bad).toMatch(/web addresses/);
    }
    expect(circleNameProblem("ab")).toMatch(/at least 3/);
    expect(circleNameProblem("Two  spaces")).toMatch(/single spaces/);
    expect(circleNameProblem("Emoji ok?")).toMatch(/Use only/);
    for (const good of ["College Gang", "Abhi's Circle", "Friends & Family-2"]) {
      expect(circleNameProblem(good), good).toBeNull();
    }
  });

  it("S-RT-05 payments-before-voting must be 0 to 6", () => {
    expect(
      validate({ ...DEFAULTS, name: "Gang", minPaidToVote: "7" }, undefined).errors.minPaidToVote,
    ).toBe("Pick 0 to 6.");
    expect(validate({ ...DEFAULTS, name: "Gang" }, undefined).cfg?.minPaidToVote).toBe(2);
  });
});

describe("repayment record (ADR 0042)", () => {
  const base = {
    onTime: 9,
    late: 1,
    loansRepaid: 2,
    defaults: 0,
    circles: 2,
    firstSeen: 1,
    lastSeen: 2,
    onTimeBps: 9000,
  };
  it("S-REP-10 summarises a record in plain words", () => {
    expect(recordSummary(base)).toBe(
      "90% of 10 months paid on time, 2 loans repaid, no defaults, across 2 circles.",
    );
    expect(
      recordSummary({ ...base, onTimeBps: 6666, defaults: 1, loansRepaid: 1, circles: 1 }),
    ).toBe("66.7% of 10 months paid on time, 1 loan repaid, 1 default, across 1 circle.");
    expect(
      recordSummary({ ...base, onTime: 0, late: 0, loansRepaid: 0, defaults: 0, onTimeBps: 0 }),
    ).toBe("No record yet.");
  });
  it("S-REP-10 only accepts real addresses", () => {
    expect(parseAddress("0xnope")).toBeNull();
    expect(parseAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8")).toBe(
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    );
  });
});
