/**
 * Small line drawings for the landing cards (ADR 0049). Ink hairlines with the cobalt
 * accent on the one element that matters; no illustration palette here (that stays on
 * the hero, ADR 0025). Marked `data-draw` so the motion layer traces the strokes, and
 * `data-pop` for dots that pop in after the lines.
 */

const INK = "var(--foreground)";
const FAINT = "var(--border)";
const BRAND = "var(--brand)";

const common = {
  viewBox: "0 0 200 96",
  width: 200,
  height: 96,
  fill: "none",
  "aria-hidden": true,
  "data-draw": "",
} as const;

/** Save every month: a row of months, all paid, this month in cobalt. */
export function SaveDiagram({ className }: { className?: string }) {
  const months = [0, 1, 2, 3, 4, 5];
  return (
    <svg {...common} className={className}>
      <path d="M8 74 H192" stroke={FAINT} strokeWidth="1.2" />
      {months.map((m) => {
        const x = 14 + m * 30;
        const current = m === months.length - 1;
        return (
          <g key={m}>
            <rect
              x={x}
              y={22}
              width={24}
              height={40}
              rx={6}
              stroke={current ? BRAND : INK}
              strokeWidth="1.3"
            />
            <g data-pop="">
              <path
                d={`M${x + 7} 42 L${x + 11} 46 L${x + 18} 38`}
                stroke={current ? BRAND : INK}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** Borrow on a vote: four voters, three yes, and the loan arrow. */
export function VoteDiagram({ className }: { className?: string }) {
  const voters = [true, true, false, true];
  return (
    <svg {...common} className={className}>
      {voters.map((yes, i) => {
        const cx = 20 + i * 38;
        return (
          <g key={i}>
            <circle cx={cx} cy={50} r={12} stroke={INK} strokeWidth="1.3" />
            <g data-pop="">
              {yes ? (
                <>
                  <circle cx={cx + 11} cy={36} r={6.5} fill={BRAND} stroke={BRAND} />
                  <path
                    d={`M${cx + 8} 36 L${cx + 10.5} 38.5 L${cx + 14} 34`}
                    stroke="#fff"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              ) : (
                <circle cx={cx + 11} cy={36} r={6.5} fill="var(--card)" stroke="var(--faint)" />
              )}
            </g>
          </g>
        );
      })}
      <path
        d="M158 50 H190 M182 42 L190 50 L182 58"
        stroke={BRAND}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Leave with notice: a notice timeline that ends with your share paid out. */
export function LeaveDiagram({ className }: { className?: string }) {
  return (
    <svg {...common} className={className}>
      <path d="M14 48 H150" stroke={INK} strokeWidth="1.3" strokeDasharray="1 0" />
      {[14, 48, 82, 116, 150].map((x) => (
        <path key={x} d={`M${x} 42 V54`} stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      ))}
      <path d="M150 48 H180" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M172 40 L180 48 L172 56"
        stroke={BRAND}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g data-pop="">
        <circle cx={188} cy={48} r={6} fill={BRAND} stroke={BRAND} />
      </g>
    </svg>
  );
}

/** Final call to action: friends in a ring around the pot. */
export function RingDiagram({ className }: { className?: string }) {
  const n = 8;
  const dots = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: 60 + 44 * Math.cos(a), y: 60 + 44 * Math.sin(a) };
  });
  return (
    <svg
      viewBox="0 0 120 120"
      width={120}
      height={120}
      fill="none"
      aria-hidden
      data-draw=""
      className={className}
    >
      <circle cx={60} cy={60} r={44} stroke={FAINT} strokeWidth="1.2" />
      <path
        d="M55 50 L55 54 C47 57 43 63 44 68 C46 75 52 79 60 79 C68 79 74 75 76 68 C77 63 73 57 65 54 L65 50 Z M52 46 H68"
        stroke={INK}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {dots.map((d, i) => (
        <g key={i} data-pop="">
          <circle
            cx={d.x}
            cy={d.y}
            r={5}
            fill={i === 0 ? BRAND : "var(--card)"}
            stroke={i === 0 ? BRAND : INK}
            strokeWidth="1.3"
          />
        </g>
      ))}
    </svg>
  );
}
