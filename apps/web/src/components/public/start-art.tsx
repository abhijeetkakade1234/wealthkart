/**
 * Line drawings for the onboarding guide (ADR 0054), in the landing page's style (ADR 0049):
 * ink hairlines, cobalt on the one thing that matters, no illustration palette. Every stroke
 * that should trace itself carries `pathLength={1}`; `start.css` draws them once when the
 * picture scrolls into view, and leaves them drawn with reduced motion or no script.
 */

const INK = "var(--foreground)";
const FAINT = "var(--border)";
const BRAND = "var(--brand)";

const line = {
  fill: "none",
  strokeWidth: 1.3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  pathLength: 1,
} as const;

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 200 140"
      width={200}
      height={140}
      fill="none"
      aria-hidden
      className={`start-art ${className ?? ""}`}
    >
      <path d="M14 122 H186" stroke={FAINT} strokeWidth="1.2" />
      {children}
    </svg>
  );
}

/** Step 1: a laptop and a phone, the phone receiving a download. */
function InstallArt() {
  return (
    <>
      <rect x="22" y="40" width="96" height="62" rx="6" stroke={INK} {...line} />
      <path d="M12 110 H128 L120 102 H20 Z" stroke={INK} {...line} />
      <rect x="138" y="30" width="44" height="80" rx="9" stroke={INK} {...line} />
      <path d="M154 36 H166" stroke={INK} {...line} />
      <path d="M160 52 V78 M150 68 L160 78 L170 68" stroke={BRAND} {...line} strokeWidth={1.7} />
      <path d="M150 90 H170" stroke={BRAND} {...line} strokeWidth={1.7} />
      <path d="M42 62 H98 M42 74 H82" stroke={FAINT} {...line} />
    </>
  );
}

/** Step 2: the recovery phrase on paper, numbered words, and a lock. */
function PhraseArt() {
  const rows = [0, 1, 2, 3];
  return (
    <>
      <path d="M40 18 H132 L150 36 V116 H40 Z" stroke={INK} {...line} />
      <path d="M132 18 V36 H150" stroke={INK} {...line} />
      {rows.map((r) => (
        <g key={r}>
          <circle cx="54" cy={48 + r * 16} r="1.6" fill={INK} />
          <path d={`M62 ${48 + r * 16} H88`} stroke={INK} {...line} />
          <circle cx="100" cy={48 + r * 16} r="1.6" fill={INK} />
          <path d={`M108 ${48 + r * 16} H134`} stroke={INK} {...line} />
        </g>
      ))}
      <rect
        x="146"
        y="86"
        width="30"
        height="24"
        rx="5"
        stroke={BRAND}
        {...line}
        strokeWidth={1.7}
      />
      <path d="M152 86 V79 A9 9 0 0 1 170 79 V86" stroke={BRAND} {...line} strokeWidth={1.7} />
      <path d="M161 95 V101" stroke={BRAND} {...line} strokeWidth={1.7} />
    </>
  );
}

function Wallet({ x, color }: { x: number; color: string }) {
  return (
    <>
      <rect x={x} y="50" width="56" height="40" rx="7" stroke={color} {...line} />
      <path
        d={`M${x + 36} 64 H${x + 56} V78 H${x + 36} A7 7 0 0 1 ${x + 36} 64 Z`}
        stroke={color}
        {...line}
      />
      <path d={`M${x + 6} 50 L${x + 40} 36 L${x + 46} 50`} stroke={color} {...line} />
    </>
  );
}

/** Step 3: your wallet and a backup wallet, joined by a dashed promise. */
function NomineeArt() {
  return (
    <>
      <Wallet x={20} color={INK} />
      <Wallet x={124} color={BRAND} />
      <path
        d="M80 60 C 96 44, 108 44, 120 58"
        stroke={INK}
        strokeWidth="1.3"
        strokeDasharray="3 4"
        strokeLinecap="round"
        className="start-fade"
      />
      <path d="M113 56 L120 58 L118 51" stroke={INK} {...line} />
    </>
  );
}

/** Step 4: a coin and a small drop for the network fee. */
function AvaxArt() {
  return (
    <>
      <circle cx="84" cy="72" r="36" stroke={INK} {...line} />
      <circle cx="84" cy="72" r="28" stroke={FAINT} {...line} />
      <path d="M68 86 L84 56 L100 86 Z" stroke={INK} {...line} />
      <path
        d="M146 52 C 146 52, 132 70, 132 80 A14 14 0 0 0 160 80 C 160 70, 146 52, 146 52 Z"
        stroke={BRAND}
        {...line}
        strokeWidth={1.7}
      />
      <path d="M140 82 A7 7 0 0 0 146 88" stroke={BRAND} {...line} strokeWidth={1.4} />
    </>
  );
}

/** Step 5: a stack of digital dollars. */
function UsdtArt() {
  return (
    <>
      <ellipse cx="74" cy="98" rx="38" ry="10" stroke={INK} {...line} />
      <path d="M36 98 V86 M112 98 V86" stroke={INK} {...line} />
      <ellipse cx="74" cy="86" rx="38" ry="10" stroke={INK} {...line} />
      <path d="M36 86 V74 M112 86 V74" stroke={INK} {...line} />
      <ellipse cx="74" cy="74" rx="38" ry="10" stroke={INK} {...line} />
      <circle cx="146" cy="60" r="28" stroke={BRAND} {...line} strokeWidth={1.7} />
      <path
        d="M155 49 C 150 44, 137 45, 138 53 C 139 60, 154 59, 155 67 C 156 75, 142 76, 137 71 M146 40 V80"
        stroke={BRAND}
        {...line}
        strokeWidth={1.7}
      />
    </>
  );
}

/** Step 6: an invite link that opens onto a ring of friends, you in cobalt. */
function JoinArt() {
  const ring = [0, 1, 2, 3, 4];
  return (
    <>
      <rect
        x="18"
        y="58"
        width="40"
        height="20"
        rx="10"
        stroke={INK}
        {...line}
        transform="rotate(-24 38 68)"
      />
      <rect
        x="42"
        y="48"
        width="40"
        height="20"
        rx="10"
        stroke={INK}
        {...line}
        transform="rotate(-24 62 58)"
      />
      <path d="M92 66 H112 M106 60 L112 66 L106 72" stroke={INK} {...line} />
      {ring.map((i) => {
        const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        const cx = 152 + Math.cos(a) * 26;
        const cy = 68 + Math.sin(a) * 26;
        return (
          <circle
            key={i}
            cx={cx.toFixed(1)}
            cy={cy.toFixed(1)}
            r="7"
            stroke={i === 0 ? BRAND : INK}
            {...line}
            strokeWidth={i === 0 ? 1.7 : 1.3}
          />
        );
      })}
      <circle cx="152" cy="68" r="12" stroke={FAINT} {...line} />
    </>
  );
}

const ART: Record<string, () => React.ReactElement> = {
  "install-core": InstallArt,
  "create-wallet": PhraseArt,
  "backup-wallet": NomineeArt,
  "get-avax": AvaxArt,
  "get-usdt": UsdtArt,
  join: JoinArt,
};

/** The drawing for a guide step, by its section id (nothing for an unknown id). */
export function StepArt({ id, className }: { id: string; className?: string }) {
  const Art = ART[id];
  if (!Art) return null;
  return (
    <Frame className={className}>
      <Art />
    </Frame>
  );
}

/** Hero: a phone holding a ring of friends, the recovery phrase card tucked behind. */
export function StartHeroArt({ className }: { className?: string }) {
  const ring = [0, 1, 2, 3, 4, 5];
  return (
    <svg
      viewBox="0 0 360 300"
      width={360}
      height={300}
      fill="none"
      aria-hidden
      className={`start-art start-hero-art ${className ?? ""}`}
    >
      <path d="M20 276 H340" stroke={FAINT} strokeWidth="1.2" />
      <g transform="rotate(-8 110 150)">
        <path d="M44 70 H150 L170 90 V230 H44 Z" stroke={INK} {...line} />
        <path d="M150 70 V90 H170" stroke={INK} {...line} />
        {[0, 1, 2, 3, 4, 5].map((r) => (
          <path key={r} d={`M62 ${108 + r * 18} H${r % 2 ? 128 : 146}`} stroke={FAINT} {...line} />
        ))}
      </g>
      <rect
        x="164"
        y="34"
        width="132"
        height="236"
        rx="22"
        stroke={INK}
        {...line}
        strokeWidth={1.5}
      />
      <path d="M212 48 H248" stroke={INK} {...line} />
      {ring.map((i) => {
        const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        const cx = 230 + Math.cos(a) * 44;
        const cy = 140 + Math.sin(a) * 44;
        return (
          <circle
            key={i}
            cx={cx.toFixed(1)}
            cy={cy.toFixed(1)}
            r="11"
            stroke={i === 3 ? BRAND : INK}
            {...line}
            strokeWidth={i === 3 ? 1.8 : 1.3}
          />
        );
      })}
      <circle cx="230" cy="140" r="18" stroke={BRAND} {...line} strokeWidth={1.8} />
      <path d="M200 228 H260" stroke={INK} {...line} strokeWidth={1.5} />
      <path d="M212 242 H248" stroke={FAINT} {...line} />
    </svg>
  );
}
