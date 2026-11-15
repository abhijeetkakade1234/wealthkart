/**
 * Generated folk-art (ADR 0025): member avatars, circle cover banners and empty-state
 * spots. Pure SVG, no network, deterministic from the wallet / circle address.
 */
import { cn } from "@/lib/utils";

import { ART } from "./palette";
import { PIECES } from "./pieces";
import {
  type AvatarShape,
  COVER_H,
  COVER_W,
  type CoverLayer,
  EMPTY_SCENES,
  type EmptyVariant,
  avatarSpec,
  coverSpec,
} from "./specs";

function Layer({ l }: { l: CoverLayer }) {
  const Piece = PIECES[l.piece];
  const s = l.size / 100;
  return (
    <g
      transform={`translate(${l.x} ${l.y}) rotate(${l.rotate} ${l.size / 2} ${l.size / 2}) scale(${s})`}
    >
      <Piece color={l.color} detail={l.detail} />
    </g>
  );
}

/* ---------- Avatar ---------- */

const AVATAR_PATHS: Record<AvatarShape, (ink: string, accent: string) => React.ReactNode> = {
  triangle: (ink, accent) => (
    <>
      <path d="M9 30 L20 9 L31 30Z" fill={ink} />
      <path d="M20 9 L16.5 16 L20 14.5 L23.5 16Z" fill={accent} />
    </>
  ),
  sun: (ink, accent) => (
    <>
      <circle cx="20" cy="20" r="10" fill={ink} />
      <circle cx="20" cy="20" r="4" fill={accent} />
    </>
  ),
  leaf: (ink, accent) => (
    <>
      <path d="M20 8 C28 13 30 21 20 32 C10 21 12 13 20 8Z" fill={ink} />
      <path d="M20 12 L20 28" stroke={accent} strokeWidth="1.6" />
    </>
  ),
  pot: (ink, accent) => (
    <>
      <path
        d="M11 22 C10 28 14 32 20 32 C26 32 30 28 29 22 C28 17 25 15 20 15 C15 15 12 17 11 22Z"
        fill={ink}
      />
      <rect x="15" y="10" width="10" height="4" rx="2" fill={accent} />
    </>
  ),
  wave: (ink, accent) => (
    <>
      <path d="M8 22 C12 17 16 17 20 22 C24 27 28 27 32 22 L32 31 L8 31Z" fill={ink} />
      <circle cx="27" cy="13" r="3.4" fill={accent} />
    </>
  ),
  diamond: (ink, accent) => (
    <>
      <path d="M20 8 L31 20 L20 32 L9 20Z" fill={ink} />
      <path d="M20 15 L25 20 L20 25 L15 20Z" fill={accent} />
    </>
  ),
};

export interface AvatarProps {
  address: string;
  /** Pixel size; the art is a 40x40 drawing. */
  size?: number;
  /** Accessible name. Omit when the name is already shown next to the avatar (decorative). */
  label?: string;
  className?: string;
}

export function Avatar({ address, size = 32, label, className }: AvatarProps) {
  const a = avatarSpec(address);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cn("shrink-0 rounded-full", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-shape={a.shape}
    >
      <circle cx="20" cy="20" r="20" fill={ART[a.ground]} />
      <g transform={`rotate(${a.rotate} 20 20)`}>
        {AVATAR_PATHS[a.shape](ART[a.ink], ART[a.accent])}
      </g>
    </svg>
  );
}

/* ---------- Circle cover ---------- */

export interface CircleCoverProps {
  address: string;
  /** Circle name, used for the accessible label. */
  name?: string;
  className?: string;
}

/** Wide banner, unique per circle. Fills its box (slice), so size it with CSS. */
export function CircleCover({ address, name, className }: CircleCoverProps) {
  const spec = coverSpec(address);
  return (
    <svg
      viewBox={`0 0 ${COVER_W} ${COVER_H}`}
      preserveAspectRatio="xMaxYMid slice"
      className={cn("block h-full w-full", className)}
      role="img"
      aria-label={name ? `Cover art for ${name}` : "Circle cover art"}
      data-layout={spec.layout}
    >
      <rect width={COVER_W} height={COVER_H} fill={ART[spec.ground]} fillOpacity={0.45} />
      {spec.layers.map((l, i) => (
        <Layer key={i} l={l} />
      ))}
    </svg>
  );
}

/* ---------- Empty-state spot ---------- */

export interface EmptyArtProps {
  variant?: EmptyVariant;
  className?: string;
}

/** Small decorative spot for empty states (docs/ui.md §9). */
export function EmptyArt({ variant = "generic", className }: EmptyArtProps) {
  return (
    <svg
      width="132"
      height="96"
      viewBox="0 0 132 96"
      className={className}
      aria-hidden
      data-variant={variant}
      data-testid="empty-art"
    >
      {EMPTY_SCENES[variant].map((l, i) => (
        <Layer key={i} l={l} />
      ))}
    </svg>
  );
}
