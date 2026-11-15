/**
 * Illustration palette (ADR 0025). Art only, never UI chrome. Values are CSS variables
 * defined in `globals.css`, so the art follows the theme tokens.
 */
export const ART = {
  mustard: "var(--art-mustard)",
  red: "var(--art-red)",
  cobalt: "var(--art-cobalt)",
  peri: "var(--art-peri)",
  cream: "var(--art-cream)",
  olive: "var(--art-olive)",
  forest: "var(--art-forest)",
} as const;

export type ArtColor = keyof typeof ART;

/** Light paper tones used as grounds behind shapes. */
export const GROUNDS = ["cream", "peri"] as const satisfies readonly ArtColor[];

/** Strong tones used for the cut shapes themselves. */
export const INKS = [
  "mustard",
  "red",
  "cobalt",
  "olive",
  "forest",
] as const satisfies readonly ArtColor[];
