import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Avatar, CircleCover, EmptyArt } from "../art";
import { GROUNDS, INKS } from "../palette";
import { PIECE_NAMES } from "../pieces";
import { prng, seedFromAddress } from "../seed";
import {
  AVATAR_SHAPES,
  COVER_H,
  COVER_LAYOUTS,
  COVER_W,
  EMPTY_SCENES,
  EMPTY_VARIANTS,
  avatarSpec,
  coverSpec,
} from "../specs";

const A = "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE";

/** 400 pseudo-random addresses, generated deterministically. */
const ADDRESSES = Array.from({ length: 400 }, (_, i) => {
  const r = prng(i + 1);
  let hex = "";
  for (let j = 0; j < 40; j++) hex += Math.floor(r() * 16).toString(16);
  return `0x${hex}`;
});

describe("seeded art", () => {
  it("S-WEB-30 same address gives the same art, whatever the letter case", () => {
    expect(seedFromAddress(A)).toBe(seedFromAddress(A.toLowerCase()));
    expect(seedFromAddress(A)).toBe(seedFromAddress(` ${A.toUpperCase().replace("0X", "0x")} `));
    expect(avatarSpec(A)).toEqual(avatarSpec(A.toLowerCase()));
    expect(coverSpec(A)).toEqual(coverSpec(A.toLowerCase()));
    // Stable across runs: no Math.random anywhere.
    expect(avatarSpec(A)).toEqual(avatarSpec(A));
  });

  it("S-WEB-31 different addresses spread across every avatar shape and cover layout", () => {
    const shapes = new Map<string, number>();
    const layouts = new Map<string, number>();
    for (const a of ADDRESSES) {
      const s = avatarSpec(a).shape;
      shapes.set(s, (shapes.get(s) ?? 0) + 1);
      const l = coverSpec(a).layout;
      layouts.set(l, (layouts.get(l) ?? 0) + 1);
    }
    expect([...shapes.keys()].sort()).toEqual([...AVATAR_SHAPES].sort());
    expect([...layouts.keys()].sort()).toEqual([...COVER_LAYOUTS].sort());
    // No shape hogs the set: each gets at least a third of its fair share.
    for (const n of shapes.values()) expect(n).toBeGreaterThan(400 / AVATAR_SHAPES.length / 3);
    // Neighbours in a members list rarely look identical.
    const full = new Set(ADDRESSES.map((a) => JSON.stringify(avatarSpec(a))));
    expect(full.size).toBeGreaterThan(150);
  });

  it("S-WEB-32 specs only use the art palette and stay inside the frame", () => {
    const art = new Set<string>([...GROUNDS, ...INKS, "cream", "peri"]);
    for (const a of ADDRESSES.slice(0, 100)) {
      const av = avatarSpec(a);
      expect(GROUNDS).toContain(av.ground);
      expect(av.ink).not.toBe(av.accent);
      const cv = coverSpec(a);
      for (const l of cv.layers) {
        expect(PIECE_NAMES).toContain(l.piece);
        expect(art.has(l.color) && art.has(l.detail)).toBe(true);
        expect(l.x).toBeGreaterThanOrEqual(0);
        expect(l.x + l.size).toBeLessThanOrEqual(COVER_W);
        expect(l.y).toBeGreaterThanOrEqual(0);
        expect(l.y).toBeLessThan(COVER_H);
      }
    }
  });
});

describe("art components", () => {
  it("S-WEB-33 avatar is decorative by default and labelled when asked", () => {
    const { container, rerender } = render(<Avatar address={A} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    rerender(<Avatar address={A} label="NightOwl" />);
    expect(screen.getByRole("img", { name: "NightOwl" })).toBeInTheDocument();
    render(<CircleCover address={A} name="College Gang" />);
    expect(screen.getByRole("img", { name: "Cover art for College Gang" })).toBeInTheDocument();
  });

  it("S-WEB-34 every empty-state variant renders a fixed, decorative scene", () => {
    for (const v of EMPTY_VARIANTS) {
      expect(EMPTY_SCENES[v].length).toBeGreaterThan(0);
      const { container, unmount } = render(<EmptyArt variant={v} />);
      const svg = container.querySelector("svg")!;
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("data-variant", v);
      expect(svg.querySelectorAll("g").length).toBeGreaterThan(0);
      unmount();
    }
  });
});
