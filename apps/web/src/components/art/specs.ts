/**
 * Pure "what to draw" functions. Components in this folder only render these specs, so
 * the choices are unit-tested without a DOM (S-WEB-30..34).
 */
import { type ArtColor, GROUNDS, INKS } from "./palette";
import type { PieceName } from "./pieces";
import { between, pick, prng, seedFromAddress } from "./seed";

/* ---------- Avatar ---------- */

export const AVATAR_SHAPES = ["triangle", "sun", "leaf", "pot", "wave", "diamond"] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

/** Shapes that still read well when turned. Pot and sun stay upright. */
const ROTATABLE: ReadonlySet<AvatarShape> = new Set(["triangle", "leaf", "diamond", "wave"]);

export interface AvatarSpec {
  shape: AvatarShape;
  ground: ArtColor;
  ink: ArtColor;
  accent: ArtColor;
  rotate: number;
}

export function avatarSpec(address: string): AvatarSpec {
  const rand = prng(seedFromAddress(address));
  const shape = pick(rand, AVATAR_SHAPES);
  const ground = pick(rand, GROUNDS);
  const ink = pick(rand, INKS);
  const accent = pick(
    rand,
    INKS.filter((k) => k !== ink),
  );
  const rotate = ROTATABLE.has(shape) ? pick(rand, [0, 45, 90, 135, 180, 270]) : 0;
  return { shape, ground, ink, accent, rotate };
}

/* ---------- Circle cover ---------- */

export const COVER_W = 600;
export const COVER_H = 200;

export const COVER_LAYOUTS = ["valley", "garden", "river", "harvest"] as const;
export type CoverLayout = (typeof COVER_LAYOUTS)[number];

export interface CoverLayer {
  piece: PieceName;
  x: number;
  y: number;
  /** Size of the piece's 100x100 box, in cover units. */
  size: number;
  rotate: number;
  color: ArtColor;
  detail: ArtColor;
}

export interface CoverSpec {
  layout: CoverLayout;
  ground: ArtColor;
  layers: CoverLayer[];
}

type Slot = {
  piece: PieceName;
  x: [number, number];
  y: [number, number];
  size: [number, number];
  rotate?: [number, number];
  fixed?: [ArtColor, ArtColor];
};

/**
 * Each layout leaves the left ~40% quiet so a circle name can sit over it if needed,
 * and keeps pieces inside the 600x200 frame (S-WEB-32).
 */
const LAYOUTS: Record<CoverLayout, Slot[]> = {
  valley: [
    { piece: "Sun", x: [300, 360], y: [16, 34], size: [54, 66] },
    { piece: "Hill", x: [380, 420], y: [60, 72], size: [128, 140], fixed: ["cobalt", "peri"] },
    { piece: "Leaf", x: [500, 520], y: [70, 92], size: [70, 86], rotate: [-20, 10] },
    { piece: "Bird", x: [250, 300], y: [70, 100], size: [44, 56] },
  ],
  garden: [
    { piece: "Flower", x: [300, 330], y: [76, 92], size: [92, 104] },
    { piece: "Flower", x: [400, 430], y: [58, 74], size: [110, 124] },
    { piece: "Leaf", x: [480, 510], y: [80, 100], size: [80, 94], rotate: [-30, 0] },
    { piece: "Sun", x: [520, 540], y: [10, 20], size: [44, 52] },
  ],
  river: [
    { piece: "Wave", x: [240, 240], y: [110, 118], size: [180, 180], fixed: ["peri", "cobalt"] },
    { piece: "Wave", x: [410, 410], y: [104, 112], size: [190, 190], fixed: ["peri", "cobalt"] },
    { piece: "Bird", x: [330, 400], y: [24, 50], size: [50, 62] },
    { piece: "Sun", x: [500, 530], y: [12, 24], size: [50, 60] },
  ],
  harvest: [
    { piece: "Pot", x: [380, 410], y: [56, 66], size: [128, 136] },
    { piece: "Coin", x: [330, 350], y: [30, 50], size: [34, 42] },
    { piece: "Coin", x: [510, 530], y: [40, 70], size: [28, 36] },
    { piece: "Leaf", x: [250, 280], y: [90, 110], size: [80, 92], rotate: [-10, 20] },
  ],
};

export function coverSpec(address: string): CoverSpec {
  const rand = prng(seedFromAddress(address) ^ 0x9e3779b9);
  const layout = pick(rand, COVER_LAYOUTS);
  const ground = pick(rand, GROUNDS);
  let last: ArtColor | null = null;
  const layers = LAYOUTS[layout].map((s): CoverLayer => {
    const size = between(rand, s.size[0], s.size[1]);
    const choices = INKS.filter((k) => k !== last);
    const color: ArtColor = s.fixed?.[0] ?? pick(rand, choices);
    const detail: ArtColor = s.fixed?.[1] ?? (color === "mustard" ? "red" : "cream");
    last = color;
    return {
      piece: s.piece,
      x: Math.min(between(rand, s.x[0], s.x[1]), COVER_W - size),
      y: Math.min(between(rand, s.y[0], s.y[1]), COVER_H - size * 0.4),
      size,
      rotate: s.rotate ? between(rand, s.rotate[0], s.rotate[1]) : 0,
      color,
      detail,
    };
  });
  return { layout, ground, layers };
}

/* ---------- Empty-state spots ---------- */

export const EMPTY_VARIANTS = [
  "circles",
  "members",
  "loans",
  "votes",
  "activity",
  "generic",
] as const;
export type EmptyVariant = (typeof EMPTY_VARIANTS)[number];

/** Fixed compositions (not seeded): empty states should look the same every time. */
export const EMPTY_SCENES: Record<EmptyVariant, CoverLayer[]> = {
  circles: [
    { piece: "Pot", x: 34, y: 18, size: 70, rotate: 0, color: "cobalt", detail: "cream" },
    { piece: "Leaf", x: 0, y: 40, size: 50, rotate: -10, color: "olive", detail: "cream" },
    { piece: "Coin", x: 104, y: 6, size: 26, rotate: 0, color: "mustard", detail: "red" },
  ],
  members: [
    { piece: "Bird", x: 6, y: 30, size: 56, rotate: 0, color: "cobalt", detail: "cream" },
    { piece: "Bird", x: 70, y: 18, size: 48, rotate: -8, color: "red", detail: "cream" },
    { piece: "Leaf", x: 64, y: 50, size: 50, rotate: 10, color: "forest", detail: "cream" },
  ],
  loans: [
    { piece: "Hill", x: 10, y: 14, size: 84, rotate: 0, color: "cobalt", detail: "peri" },
    { piece: "Coin", x: 100, y: 10, size: 28, rotate: 0, color: "mustard", detail: "red" },
  ],
  votes: [
    { piece: "Flower", x: 14, y: 8, size: 70, rotate: -6, color: "red", detail: "mustard" },
    { piece: "Flower", x: 60, y: 14, size: 64, rotate: 6, color: "mustard", detail: "red" },
  ],
  activity: [
    { piece: "Wave", x: 0, y: 30, size: 132, rotate: 0, color: "peri", detail: "cobalt" },
    { piece: "Sun", x: 84, y: 2, size: 40, rotate: 0, color: "mustard", detail: "red" },
  ],
  generic: [
    { piece: "Sun", x: 74, y: 4, size: 40, rotate: 0, color: "mustard", detail: "red" },
    { piece: "Hill", x: 4, y: 20, size: 76, rotate: 0, color: "cobalt", detail: "peri" },
    { piece: "Leaf", x: 70, y: 46, size: 50, rotate: -20, color: "olive", detail: "cream" },
  ],
};
