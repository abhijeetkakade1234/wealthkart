/**
 * Landing hero: the one large cut-paper piece (ADR 0025): friends' hands, the shared pot,
 * coins dropping in, a tulip, a bird and the mountain. Redrawn from the placeholder in
 * `docs/design/gallery.html`; the illustrator's final piece replaces it later.
 *
 * Pieces settle in with CSS on first paint (`.land-paper`, no JavaScript needed), and each
 * layer carries `data-depth` so the GSAP layer can drift them at different speeds as the
 * hero scrolls away. Colours come from the art palette only.
 */
import { ART } from "@/components/art/palette";

const C = ART;

function Piece({
  delay,
  depth,
  children,
}: {
  delay: number;
  depth: number;
  children: React.ReactNode;
}) {
  return (
    <g data-depth={depth}>
      <g className="land-paper" style={{ animationDelay: `${delay}ms` }}>
        {children}
      </g>
    </g>
  );
}

function Coin({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r="20" fill={C.mustard} />
      <circle r="12" fill="none" stroke={C.red} strokeWidth="3" />
      <path d="M-5 -4 L5 -4 M-5 4 L5 4" stroke={C.red} strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

export function HeroArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 560 460"
      width="560"
      height="460"
      className={className}
      role="img"
      aria-label="Cut-paper illustration: two friends' hands dropping coins into a shared clay pot, with leaves, a tulip, a bird and snowy mountains around it"
      data-testid="hero-art"
    >
      {/* far: leaves, mountains, confetti */}
      <Piece delay={80} depth={0.25}>
        <g transform="translate(40 330) rotate(-38) scale(1.25)">
          <path d="M0 0 C40 -60 120 -70 170 -20 C120 10 50 30 0 0Z" fill={C.olive} />
          <path d="M8 -4 C60 -30 110 -36 160 -22" stroke={C.cream} strokeWidth="3" fill="none" />
          <path
            d="M50 -20 L62 -44 M80 -27 L96 -50 M110 -30 L126 -50 M50 -18 L58 2 M82 -26 L92 0 M112 -29 L120 -6"
            stroke={C.cream}
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </Piece>
      <Piece delay={140} depth={0.3}>
        <path d="M380 120 C430 60 520 70 540 40 C520 120 470 170 400 190 Z" fill={C.forest} />
        <path d="M392 178 C440 150 490 110 528 54" stroke={C.cream} strokeWidth="2.5" fill="none" />
      </Piece>
      <Piece delay={200} depth={0.15}>
        <g transform="translate(360 440) scale(1.1)">
          <path d="M0 0 L60 -90 L120 0Z" fill={C.cobalt} />
          <path d="M60 -90 L44 -66 L54 -70 L60 -60 L68 -71 L76 -66Z" fill={C.cream} />
          <path d="M70 0 L120 -66 L170 0Z" fill={C.peri} />
          <path d="M120 -66 L108 -50 L118 -52 L124 -44 L132 -50Z" fill="#fff" />
        </g>
      </Piece>
      <Piece delay={520} depth={0.6}>
        <path d="M200 60 L212 52 L214 66Z" fill={C.red} />
        <path d="M470 250 L482 244 L480 258Z" fill={C.mustard} />
        <rect x="350" y="62" width="10" height="10" transform="rotate(30 355 67)" fill={C.cobalt} />
        <rect x="90" y="220" width="9" height="9" transform="rotate(45 94 224)" fill={C.red} />
        <circle cx="440" cy="300" r="5" fill={C.olive} />
        <circle cx="180" cy="420" r="6" fill={C.mustard} />
        <path d="M500 190 l6 -14 l6 14 l-6 6z" fill={C.peri} />
      </Piece>

      {/* mid: tulip and bird */}
      <Piece delay={260} depth={0.45}>
        <path d="M120 300 C118 240 128 190 150 150" stroke={C.forest} strokeWidth="5" fill="none" />
        <path
          d="M130 150 C126 120 140 96 150 92 C160 96 176 120 170 150 C160 160 140 160 130 150Z"
          fill={C.mustard}
        />
        <path
          d="M150 96 L150 152 M138 118 L150 130 L162 118"
          stroke={C.red}
          strokeWidth="3"
          fill="none"
        />
      </Piece>
      <Piece delay={320} depth={0.7}>
        <path
          d="M60 80 C80 60 110 62 122 74 C110 76 100 86 96 100 C86 90 72 86 60 80Z"
          fill={C.cobalt}
        />
        <path d="M122 74 L140 68 L126 82Z" fill={C.mustard} />
        <circle cx="108" cy="76" r="3" fill={C.cream} />
      </Piece>

      {/* near: the pot (matka) */}
      <Piece delay={160} depth={0}>
        <path
          d="M200 270 C190 330 220 400 280 404 C340 400 372 330 360 270 C352 240 322 228 280 228 C238 228 208 240 200 270Z"
          fill={C.cobalt}
        />
        <path d="M244 228 C244 214 252 206 280 206 C308 206 316 214 316 228Z" fill="var(--brand)" />
        <rect x="236" y="198" width="88" height="14" rx="6" fill={C.red} />
        <path
          d="M206 292 L222 278 L238 292 L254 278 L270 292 L286 278 L302 292 L318 278 L334 292 L350 278 L356 290"
          stroke={C.cream}
          strokeWidth="3.5"
          fill="none"
          strokeLinejoin="round"
        />
        <path
          d="M210 330 C250 346 310 346 352 330"
          stroke={C.mustard}
          strokeWidth="10"
          fill="none"
        />
        <g fill={C.cream}>
          <circle cx="232" cy="362" r="4.5" />
          <circle cx="256" cy="372" r="4.5" />
          <circle cx="280" cy="376" r="4.5" />
          <circle cx="304" cy="372" r="4.5" />
          <circle cx="328" cy="362" r="4.5" />
        </g>
      </Piece>

      {/* front: hands and coins */}
      <Piece delay={380} depth={-0.35}>
        <g transform="translate(150 120) rotate(32)">
          <rect x="0" y="0" width="74" height="40" rx="18" fill={C.red} />
          <rect x="58" y="-14" width="16" height="30" rx="8" fill={C.red} />
          <path
            d="M12 12 L48 12 M12 22 L52 22"
            stroke={C.cream}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <rect x="-60" y="10" width="64" height="22" rx="8" fill={C.peri} />
        </g>
      </Piece>
      <Piece delay={440} depth={-0.35}>
        <g transform="translate(410 150) rotate(150)">
          <rect x="0" y="0" width="74" height="40" rx="18" fill={C.mustard} />
          <rect x="58" y="-14" width="16" height="30" rx="8" fill={C.mustard} />
          <path
            d="M14 14 L50 14 M14 24 L54 24"
            stroke={C.cobalt}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <rect x="-60" y="10" width="64" height="22" rx="8" fill={C.forest} />
        </g>
      </Piece>
      <Piece delay={620} depth={-0.6}>
        <Coin x={240} y={84} s={0.65} />
      </Piece>
      <Piece delay={700} depth={-0.5}>
        <Coin x={306} y={112} s={0.8} />
      </Piece>
      <Piece delay={780} depth={-0.4}>
        <Coin x={262} y={150} />
      </Piece>
    </svg>
  );
}
