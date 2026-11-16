import { describe, expect, it } from "vitest";
import {
  circleVaultAbi,
  formatAvax,
  formatUnitsDown,
  periodLabel,
  shortAddress,
} from "../src/index.js";

const AVAX = 10n ** 18n;

describe("formatUnitsDown (S-WEB-10, ADR 0046: 6-decimal USDT)", () => {
  it("formats USDT units with 2 shown decimals, rounding down", () => {
    expect(formatUnitsDown(25_000_000n, 6)).toBe("25.00");
    expect(formatUnitsDown(1_999_999n, 6)).toBe("1.99");
    expect(formatUnitsDown(1_234_567_890_000n, 6)).toBe("1,234,567.89");
  });

  it("pads when more decimals are asked for than the unit has", () => {
    expect(formatUnitsDown(1_500_000n, 6, 8)).toBe("1.50000000");
    expect(formatUnitsDown(-2_500_000n, 6)).toBe("-2.50");
  });
});

describe("formatAvax (S-WEB-10: exact decimals, no float rounding)", () => {
  it("formats whole and fractional AVAX", () => {
    expect(formatAvax(AVAX / 2n)).toBe("0.50");
    expect(formatAvax(48n * AVAX + (62n * AVAX) / 100n)).toBe("48.62");
    expect(formatAvax(1_234_567n * AVAX)).toBe("1,234,567.00");
  });

  it("rounds down so it never overstates a balance", () => {
    expect(formatAvax(AVAX - 1n)).toBe("0.99");
    expect(formatAvax(19n * 10n ** 15n, 2)).toBe("0.01");
  });

  it("handles more decimals and zero", () => {
    expect(formatAvax(123_456_789_000_000_000n, 4)).toBe("0.1234");
    expect(formatAvax(0n)).toBe("0.00");
  });
});

describe("display helpers", () => {
  it("shortens valid addresses only", () => {
    expect(shortAddress("0x3f1c00000000000000000000000000000000a1c2")).toBe("0x3f1c…a1c2");
    expect(shortAddress("not-an-address")).toBe("not-an-address");
  });

  it("labels periods", () => {
    expect(periodLabel(24_323)).toBe("December 2026");
    expect(periodLabel(24_324n)).toBe("January 2027");
  });
});

describe("generated ABI", () => {
  it("exposes the CircleVault functions the app uses", () => {
    const names = circleVaultAbi.filter((e) => e.type === "function").map((e) => e.name);
    for (const fn of ["contribute", "amountDue", "declareHoliday", "stakeOf", "memberOf"]) {
      expect(names).toContain(fn);
    }
  });
});
