import { PIECES, type PieceName } from "@/components/art";
import type { ArtColor } from "@/components/art";

/**
 * Hero art for the sign-in screen (ADR 0025: cut-paper only on hero, covers, empty states,
 * avatars). Pieces sit on a ring, like friends around a table: the product is a circle.
 * Each piece drops in with a small stagger; reduced motion shows it still.
 */
const RING: Array<{
  piece: PieceName;
  angle: number;
  size: number;
  rotate: number;
  color?: ArtColor;
  detail?: ArtColor;
}> = [
  { piece: "Sun", angle: -90, size: 112, rotate: 0 },
  { piece: "Leaf", angle: -38, size: 92, rotate: 18, color: "olive" },
  { piece: "Bird", angle: 12, size: 96, rotate: -8, color: "cobalt" },
  { piece: "Coin", angle: 62, size: 84, rotate: 10 },
  { piece: "Pot", angle: 112, size: 96, rotate: -6, color: "red", detail: "cream" },
  { piece: "Flower", angle: 162, size: 90, rotate: 14, color: "red", detail: "mustard" },
  { piece: "Wave", angle: 212, size: 100, rotate: -12 },
  { piece: "Leaf", angle: 250, size: 76, rotate: -150, color: "forest" },
];

const CX = 300;
const CY = 300;
const R = 190;

export function PaperCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" className={className} aria-hidden focusable="false">
      {/* the table: a soft periwinkle disc with a cut cream ring */}
      <circle cx={CX} cy={CY} r={R + 70} fill="var(--art-peri)" opacity="0.45" />
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke="var(--art-cream)"
        strokeWidth="26"
        className="paper-ring"
      />
      <circle cx={CX} cy={CY} r={R - 95} fill="var(--art-cobalt)" className="paper-core" />
      <circle cx={CX} cy={CY} r={22} fill="var(--art-mustard)" className="paper-core" />

      {RING.map((p, i) => {
        const Piece = PIECES[p.piece];
        const a = (p.angle * Math.PI) / 180;
        const x = CX + R * Math.cos(a) - p.size / 2;
        const y = CY + R * Math.sin(a) - p.size / 2;
        const s = p.size / 100;
        return (
          <g key={`${p.piece}-${i}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            {/* CSS animates this group only, so it never fights the SVG transforms */}
            <g className="paper-piece" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <g transform={`rotate(${p.rotate} ${p.size / 2} ${p.size / 2}) scale(${s})`}>
                <Piece color={p.color} detail={p.detail} />
              </g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
