import { describe, expect, it } from "vitest";

import { loginHref, safeNext } from "../safe-next";

describe("sign-in return path (S-WEB-40)", () => {
  it("returns to the app page you came from", () => {
    expect(safeNext("/app/circle/pay/?id=0xabc")).toBe("/app/circle/pay/?id=0xabc");
    expect(loginHref("/app/new/")).toBe("/login/?next=%2Fapp%2Fnew%2F");
  });

  it("never sends you to another site or outside the app", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example",
      "//evil.example",
      "/\evil",
      "/kit/",
      "/",
    ]) {
      expect(safeNext(bad)).toBe("/app/");
    }
  });
});
