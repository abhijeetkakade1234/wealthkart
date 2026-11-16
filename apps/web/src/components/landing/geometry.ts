/**
 * Geometry of the "one month" diagram, shared by the SVG (pot-diagram.tsx) and the scroll
 * timeline (motion.ts). No imports, so the motion chunk stays small.
 */
export const POT = {
  mouth: { x: 200, y: 160 },
  /** Inside of the pot, for the fill level. */
  top: 190,
  bottom: 316,
  /** Fill levels as a share of the pot, per step. */
  levels: { start: 0.1, saved: 0.62, lent: 0.34, repaid: 0.7 },
} as const;

export const CENTER = { x: 200, y: 214 };
export const R = 150;

/** Friend positions on the circle; index 4 (left) is the borrower. */
export const FRIENDS = [-90, -18, 54, 126, 198].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return {
    x: Math.round(CENTER.x + R * Math.cos(a)),
    y: Math.round(CENTER.y + R * Math.sin(a)),
  };
});

export const BORROWER = 4;
/** Votes of friends 0..3: three yes, one no. */
export const VOTES = [true, true, false, true] as const;

export function levelY(share: number) {
  return POT.bottom - share * (POT.bottom - POT.top);
}
