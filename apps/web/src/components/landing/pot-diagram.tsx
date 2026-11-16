/**
 * The "one month in a circle" diagram (ADR 0049): five friends around a shared pot.
 * Line drawing in ink with the cobalt accent for the one thing that matters in each step.
 *
 * The server renders the END state (pot filled, Kiwi's loan voted through, interest back
 * in the pot), so the picture tells the whole story with JavaScript or motion switched off.
 * `motion.ts` rewinds it to the start and scrubs the story with scroll.
 */
import { LANDING_MONTH } from "@/content/landing";

import { BORROWER, CENTER, FRIENDS, POT, R, VOTES, levelY } from "./geometry";

const POT_BODY =
  "M181 166 L181 180 C149 190 129 220 132 252 C137 294 168 318 200 318 C232 318 263 294 268 252 C271 220 251 190 219 180 L219 166 Z";

function Coin({
  cx,
  cy,
  accent = false,
  ...rest
}: { cx: number; cy: number; accent?: boolean } & React.SVGProps<SVGGElement>) {
  return (
    <g {...rest}>
      <circle
        cx={cx}
        cy={cy}
        r="7"
        fill={accent ? "var(--brand)" : "var(--card)"}
        stroke={accent ? "var(--brand)" : "var(--foreground)"}
        strokeWidth="1.4"
      />
      <circle
        cx={cx}
        cy={cy}
        r="3"
        fill="none"
        stroke={accent ? "var(--card)" : "var(--foreground)"}
        strokeWidth="1.2"
      />
    </g>
  );
}

function Person({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r="19"
        fill="var(--card)"
        stroke="var(--foreground)"
        strokeWidth="1.3"
      />
      <circle cx={x} cy={y - 5} r="5" fill="none" stroke="var(--foreground)" strokeWidth="1.3" />
      <path
        d={`M${x - 9} ${y + 11} C${x - 7} ${y + 3} ${x + 7} ${y + 3} ${x + 9} ${y + 11}`}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </g>
  );
}

/** Words drawn in the diagram; English by default, translated on `/hi/` and `/mr/` (ADR 0057). */
export interface PotLabels {
  art: string;
  interest: string;
  asks: string;
  /** "{n} of 4 said yes": `{n}` is filled in here and by `motion.ts` while it counts. */
  tally: string;
}

const EN_LABELS: PotLabels = {
  art: "Five friends sit around a shared pot. Each puts in, Kiwi asks for a loan, three of the other four vote yes, the pot lends to Kiwi, and Kiwi pays it back with a little interest that stays in the pot.",
  interest: "+ interest",
  asks: "asks to borrow",
  tally: "{n} of 4 said yes",
};

export function PotDiagram({
  className,
  names = [...LANDING_MONTH.friends, LANDING_MONTH.borrower],
  labels = EN_LABELS,
}: {
  className?: string;
  names?: string[];
  labels?: PotLabels;
}) {
  const b = FRIENDS[BORROWER];
  const repaid = levelY(POT.levels.repaid);
  return (
    <svg
      viewBox="0 0 400 424"
      width="400"
      height="424"
      className={className}
      role="img"
      aria-label={labels.art}
      data-month-svg
    >
      <defs>
        <clipPath id="pot-inside">
          <path d={POT_BODY} />
        </clipPath>
      </defs>

      {/* the circle of friends */}
      <circle
        cx={CENTER.x}
        cy={CENTER.y}
        r={R}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.2"
        strokeDasharray="2 6"
        strokeLinecap="round"
      />

      {/* pot */}
      <g clipPath="url(#pot-inside)">
        <rect
          x="120"
          y={repaid}
          width="160"
          height={POT.bottom + 4 - repaid}
          fill="var(--brand-soft)"
          data-pot-level
        />
        <rect x="120" y={repaid} width="160" height="1.6" fill="var(--brand)" data-pot-line />
      </g>
      <path d={POT_BODY} fill="none" stroke="var(--foreground)" strokeWidth="1.5" />
      <rect
        x="168"
        y="156"
        width="64"
        height="12"
        rx="6"
        fill="var(--card)"
        stroke="var(--foreground)"
        strokeWidth="1.5"
      />
      <path
        d="M146 230 L156 220 L166 230 L176 220 L186 230 L196 220 L206 230 L216 220 L226 230 L236 220 L246 230 L254 222"
        fill="none"
        stroke="var(--faint)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <g data-interest-label>
        <text
          x="200"
          y="282"
          textAnchor="middle"
          className="font-mono"
          fontSize="14"
          fill="var(--brand)"
        >
          {labels.interest}
        </text>
      </g>

      {/* friends and their names */}
      {FRIENDS.map((f, i) => (
        <g key={names[i]}>
          <Person x={f.x} y={f.y} />
          <text
            x={f.x}
            y={f.y + 40}
            textAnchor="middle"
            className="font-mono"
            fontSize="15"
            fill="var(--muted-foreground)"
          >
            {names[i]}
          </text>
        </g>
      ))}

      {/* the borrower's ring and note */}
      <circle
        cx={b.x}
        cy={b.y}
        r="25"
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.6"
        data-borrower
      />
      <g data-borrower-note>
        <text
          x={b.x}
          y={b.y - 36}
          textAnchor="middle"
          className="font-mono"
          fontSize="14"
          fill="var(--brand)"
        >
          {labels.asks}
        </text>
      </g>

      {/* votes */}
      {VOTES.map((yes, i) => {
        const f = FRIENDS[i];
        const x = f.x + 16;
        const y = f.y - 16;
        return (
          <g key={i} data-vote={yes ? "yes" : "no"}>
            <circle
              cx={x}
              cy={y}
              r="9"
              fill={yes ? "var(--brand)" : "var(--card)"}
              stroke={yes ? "var(--brand)" : "var(--faint)"}
              strokeWidth="1.3"
            />
            {yes ? (
              <path
                d={`M${x - 4} ${y} L${x - 1} ${y + 3} L${x + 4} ${y - 3}`}
                fill="none"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <path
                d={`M${x - 3.5} ${y} L${x + 3.5} ${y}`}
                stroke="var(--faint)"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}
      <g data-tally>
        <text
          x="200"
          y="414"
          textAnchor="middle"
          className="font-mono"
          fontSize="15"
          fill="var(--foreground)"
          data-tally-text
          data-tally-template={labels.tally}
        >
          {labels.tally.replace("{n}", "3")}
        </text>
      </g>

      {/* moving coins: hidden in the end state, driven by the timeline */}
      {FRIENDS.map((f, i) => (
        <Coin key={i} cx={f.x} cy={f.y} opacity={0} data-coin-in />
      ))}
      <g opacity={0} data-loan>
        <Coin cx={POT.mouth.x - 5} cy={POT.mouth.y} />
        <Coin cx={POT.mouth.x + 5} cy={POT.mouth.y - 4} />
      </g>
      <g opacity={0} data-repay>
        <Coin cx={b.x - 5} cy={b.y} />
        <Coin cx={b.x + 5} cy={b.y - 4} />
        <Coin cx={b.x + 1} cy={b.y - 14} accent />
      </g>
    </svg>
  );
}
