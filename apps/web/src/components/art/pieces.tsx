/**
 * Placeholder cut-paper pieces (ADR 0025), redrawn from `docs/design/gallery.html`.
 * Each piece is a <g> drawn inside a 100x100 box with its origin at the top-left, so
 * compositions can place and scale them with one transform. An illustrator replaces these
 * later (docs/design/illustrator-brief.md); the names and the 100x100 box stay the same.
 */
import { ART, type ArtColor } from "./palette";

export interface PieceProps {
  /** Main paper colour. */
  color?: ArtColor;
  /** Cut-out / detail colour. */
  detail?: ArtColor;
}

const c = (k: ArtColor) => ART[k];

export function Leaf({ color = "olive", detail = "cream" }: PieceProps) {
  return (
    <g>
      <path d="M6 82 C24 40 64 16 96 8 C88 44 62 80 6 82Z" fill={c(color)} />
      <path d="M12 78 C40 58 66 36 90 14" stroke={c(detail)} strokeWidth="2.6" fill="none" />
      <path
        d="M36 60 L34 44 M52 46 L52 30 M68 32 L70 20 M36 60 L50 62 M52 46 L66 50 M68 32 L80 36"
        stroke={c(detail)}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

export function Sun({ color = "mustard", detail = "red" }: PieceProps) {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <g>
      {rays.map((deg) => (
        <path
          key={deg}
          d="M50 4 L55 20 L45 20Z"
          fill={c(color)}
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="26" fill={c(color)} />
      <circle cx="50" cy="50" r="15" fill="none" stroke={c(detail)} strokeWidth="3.5" />
      <circle cx="50" cy="50" r="5" fill={c(detail)} />
    </g>
  );
}

export function Bird({ color = "cobalt", detail = "cream" }: PieceProps) {
  return (
    <g>
      <path d="M10 62 C20 36 52 30 72 42 L94 34 L84 50 C80 72 50 84 22 76 Z" fill={c(color)} />
      <path d="M30 52 C44 38 60 40 66 50 C54 52 42 60 30 52Z" fill={c(detail)} />
      <circle cx="78" cy="44" r="2.6" fill={c(detail)} />
      <path d="M10 62 L2 54 L4 70Z" fill={c(color)} />
    </g>
  );
}

export function Flower({ color = "red", detail = "mustard" }: PieceProps) {
  return (
    <g>
      <path d="M50 96 C48 76 50 60 52 44" stroke={ART.forest} strokeWidth="4" fill="none" />
      <path d="M50 78 C38 70 30 72 24 64 C36 60 44 66 50 78Z" fill={ART.forest} />
      <path d="M34 44 C30 22 42 6 50 4 C58 6 70 22 66 44 C58 52 42 52 34 44Z" fill={c(color)} />
      <path d="M50 10 L50 46 M40 26 L50 36 L60 26" stroke={c(detail)} strokeWidth="3" fill="none" />
    </g>
  );
}

export function Hill({ color = "cobalt", detail = "peri" }: PieceProps) {
  return (
    <g>
      <path d="M0 100 L36 34 L72 100Z" fill={c(color)} />
      <path d="M36 34 L27 50 L33 48 L37 54 L42 47 L46 51Z" fill={ART.cream} />
      <path d="M42 100 L72 52 L100 100Z" fill={c(detail)} />
      <path d="M72 52 L65 63 L71 62 L75 67 L80 62Z" fill="#fff" />
    </g>
  );
}

export function Wave({ color = "peri", detail = "cobalt" }: PieceProps) {
  return (
    <g>
      <path
        d="M0 60 C12 46 24 46 34 60 C44 74 56 74 66 60 C76 46 88 46 100 60 L100 100 L0 100Z"
        fill={c(color)}
      />
      <path
        d="M0 76 C12 64 24 64 34 76 C44 88 56 88 66 76 C76 64 88 64 100 76"
        stroke={c(detail)}
        strokeWidth="3"
        fill="none"
      />
    </g>
  );
}

export function Coin({ color = "mustard", detail = "red" }: PieceProps) {
  return (
    <g>
      <circle cx="50" cy="50" r="40" fill={c(color)} />
      <circle cx="50" cy="50" r="24" fill="none" stroke={c(detail)} strokeWidth="5" />
      <path
        d="M40 42 L60 42 M40 58 L60 58"
        stroke={c(detail)}
        strokeWidth="5"
        strokeLinecap="round"
      />
    </g>
  );
}

/** The clay pot (matka): the circle's shared fund. */
export function Pot({ color = "cobalt", detail = "cream" }: PieceProps) {
  return (
    <g>
      <rect x="28" y="6" width="44" height="8" rx="4" fill={ART.red} />
      <path d="M36 16 C36 10 40 8 50 8 C60 8 64 10 64 16Z" fill={c(color)} />
      <path
        d="M14 46 C8 74 26 96 50 96 C74 96 92 74 86 46 C82 26 68 18 50 18 C32 18 18 26 14 46Z"
        fill={c(color)}
      />
      <path
        d="M17 50 L25 42 L33 50 L41 42 L49 50 L57 42 L65 50 L73 42 L81 50"
        stroke={c(detail)}
        strokeWidth="2.6"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M18 66 C38 74 62 74 82 66" stroke={ART.mustard} strokeWidth="6" fill="none" />
    </g>
  );
}

export const PIECES = { Leaf, Sun, Bird, Flower, Hill, Wave, Coin, Pot } as const;
export type PieceName = keyof typeof PIECES;
export const PIECE_NAMES = Object.keys(PIECES) as PieceName[];
