import { describe, expect, it } from "vitest";

import { formatTimeLeft } from "@/components/app/countdown-utc";
import { pageWindow } from "@/components/app/pagination";
import { parseCircleId } from "@/lib/circle";
import { DEFAULTS, validate } from "@/lib/circle-form";

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
      { ...DEFAULTS, name: "", installment: "0", dueDay: "31", secondFeeDay: "5", holidays: "13" },
      SELF,
    );
    expect(v.ok).toBe(false);
    expect(v.errors.name).toBe("Give the circle a name.");
    expect(v.errors.installment).toMatch(/above 0/);
    expect(v.errors.dueDay).toBe("Pick a day from 1 to 28.");
    expect(v.errors.secondFeeDay).toMatch(/after the due day/);
    expect(v.errors.holidays).toBe("Pick 0 to 12.");
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

  it("rejects names over 48 bytes, counting multi-byte characters", () => {
    expect(validate({ ...DEFAULTS, name: "a".repeat(49) }, SELF).errors.name).toMatch(/48/);
    expect(validate({ ...DEFAULTS, name: "ü".repeat(25) }, SELF).errors.name).toMatch(/48/); // 50 bytes
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
