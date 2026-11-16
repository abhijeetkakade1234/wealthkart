/**
 * Landing motion (ADR 0049), loaded on demand by `landing-motion.tsx` only on `/`.
 * Everything here starts from markup that already reads correctly without it: GSAP
 * hides things just before animating them, and `revert()` puts the page back exactly.
 *
 * - Section reveals: elements marked `data-reveal` rise in once when they scroll into view.
 * - Hairlines (`data-line`) draw across; line drawings (`data-draw`) trace their strokes.
 * - Hero layers (`data-depth`) drift at different speeds as the hero scrolls away.
 * - The "one month" scene is scrubbed by scroll inside a sticky stage (month-scene logic).
 */
import type { gsap as GSAP } from "gsap";
import type { ScrollTrigger as ST } from "gsap/ScrollTrigger";

import { BORROWER, FRIENDS, POT, levelY } from "./geometry";

type Gsap = typeof GSAP;
type ScrollTriggerT = typeof ST;

const EASE = "power3.out";
/** The tally line, in the page's language (`data-tally-template`, ADR 0057). */
const TALLY_TEMPLATE = "{n} of 4 said yes";
function tallyLine(el: Element | null, n: number): string {
  const template = el?.getAttribute("data-tally-template") ?? TALLY_TEMPLATE;
  return template.replace("{n}", String(n));
}

/** Below the first screen? Only those get hidden, so nothing visible ever blinks. */
function belowFold(el: Element) {
  return el.getBoundingClientRect().top > window.innerHeight * 0.92;
}

export function startLandingMotion(root: HTMLElement, gsap: Gsap, ScrollTrigger: ScrollTriggerT) {
  root.dataset.motion = "on";

  const ctx = gsap.context(() => {
    revealOnScroll(root, gsap, ScrollTrigger);
    heroDrift(root, gsap);
    monthScene(root, gsap, ScrollTrigger);
  }, root);

  // The sticky track changes the page height; measure again once layout settles.
  ScrollTrigger.refresh();

  return () => {
    ctx.revert();
    delete root.dataset.motion;
    root.querySelectorAll<HTMLElement>("[data-step]").forEach((el) => {
      delete el.dataset.active;
    });
    const bar = root.querySelector<HTMLElement>("[data-month-progress]");
    if (bar) bar.style.transform = "scaleX(0)";
    const tally = root.querySelector("[data-tally-text]");
    if (tally) tally.textContent = tallyLine(tally, 3);
    ScrollTrigger.refresh();
  };
}

function revealOnScroll(root: HTMLElement, gsap: Gsap, ScrollTrigger: ScrollTriggerT) {
  const items = gsap.utils.toArray<HTMLElement>("[data-reveal]", root).filter(belowFold);
  if (items.length) {
    gsap.set(items, { autoAlpha: 0, y: 28 });
    ScrollTrigger.batch(items, {
      start: "top 88%",
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          ease: EASE,
          stagger: 0.09,
          overwrite: true,
        }),
    });
  }

  for (const line of gsap.utils.toArray<HTMLElement>("[data-line]", root).filter(belowFold)) {
    gsap.fromTo(
      line,
      { scaleX: 0, transformOrigin: "0% 50%" },
      {
        scaleX: 1,
        duration: 1.2,
        ease: "power2.inOut",
        scrollTrigger: { trigger: line, start: "top 90%", once: true },
      },
    );
  }

  for (const svg of gsap.utils.toArray<SVGElement>("[data-draw]", root).filter(belowFold)) {
    const paths = Array.from(svg.querySelectorAll<SVGGeometryElement>("path, circle, rect, line"));
    const dots = Array.from(svg.querySelectorAll<SVGElement>("[data-pop]"));
    const tl = gsap.timeline({
      scrollTrigger: { trigger: svg, start: "top 85%", once: true },
    });
    for (const p of paths) {
      if (p.closest("[data-pop]")) continue;
      const len = Math.ceil(p.getTotalLength?.() ?? 0);
      if (!len) continue;
      tl.fromTo(
        p,
        { strokeDasharray: len, strokeDashoffset: len },
        {
          strokeDashoffset: 0,
          duration: 1.1,
          ease: "power2.inOut",
          clearProps: "strokeDasharray,strokeDashoffset",
        },
        0,
      );
    }
    if (dots.length) {
      tl.fromTo(
        dots,
        { autoAlpha: 0, scale: 0.4, transformOrigin: "50% 50%" },
        { autoAlpha: 1, scale: 1, duration: 0.5, ease: "back.out(2)", stagger: 0.12 },
        0.5,
      );
    }
  }
}

function heroDrift(root: HTMLElement, gsap: Gsap) {
  const hero = root.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;
  for (const layer of gsap.utils.toArray<SVGGElement>("[data-depth]", hero)) {
    const depth = Number(layer.dataset.depth ?? 0);
    if (!depth) continue;
    gsap.to(layer, {
      y: depth * -90,
      ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 },
    });
  }
}

/** The signature moment: one month of a circle, scrubbed by scroll. */
function monthScene(root: HTMLElement, gsap: Gsap, ScrollTrigger: ScrollTriggerT) {
  const track = root.querySelector<HTMLElement>("[data-month-track]");
  const svg = track?.querySelector<SVGSVGElement>("[data-month-svg]");
  if (!track || !svg) return;
  const q = <T extends Element>(sel: string) => gsap.utils.toArray<T>(sel, svg);

  const level = q<SVGRectElement>("[data-pot-level], [data-pot-line]");
  const levelAt = (share: number) => {
    const y = levelY(share);
    return { attr: { y } };
  };
  const coinsIn = q<SVGGElement>("[data-coin-in]");
  const votes = q<SVGGElement>("[data-vote]");
  const steps = gsap.utils.toArray<HTMLElement>("[data-step]", track);
  const progress = track.querySelector<HTMLElement>("[data-month-progress]");
  const tallyText = svg.querySelector<SVGTextElement>("[data-tally-text]");
  const b = FRIENDS[BORROWER];
  const tally = { n: 3 };
  const writeTally = () => {
    if (tallyText) tallyText.textContent = tallyLine(tallyText, Math.round(tally.n));
  };

  const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });

  // 0 to 1: everyone puts in, the pot fills.
  tl.fromTo(level, levelAt(POT.levels.start), { ...levelAt(POT.levels.saved), duration: 1 }, 0);
  coinsIn.forEach((coin, i) => {
    const f = FRIENDS[i];
    const at = 0.05 + i * 0.12;
    tl.fromTo(coin, { autoAlpha: 0, x: 0, y: 0 }, { autoAlpha: 1, duration: 0.08 }, at);
    tl.to(coin, { x: POT.mouth.x - f.x, y: POT.mouth.y - f.y, duration: 0.42 }, at + 0.06);
    tl.to(coin, { autoAlpha: 0, duration: 0.08 }, at + 0.46);
  });

  // 1 to 2: Kiwi asks, the others vote.
  tl.fromTo(
    "[data-borrower], [data-borrower-note]",
    { autoAlpha: 0 },
    { autoAlpha: 1, duration: 0.25 },
    1.05,
  );
  tl.fromTo(
    votes,
    { autoAlpha: 0, scale: 0.3, transformOrigin: "50% 50%" },
    { autoAlpha: 1, scale: 1, duration: 0.18, stagger: 0.14, ease: "back.out(2)" },
    1.3,
  );
  tl.fromTo("[data-tally]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 1.25);
  tl.fromTo(tally, { n: 0 }, { n: 3, duration: 0.6, ease: "none", onUpdate: writeTally }, 1.3);

  // 2 to 3: the loan goes out to Kiwi; the pot goes down.
  tl.fromTo("[data-loan]", { autoAlpha: 0, x: 0, y: 0 }, { autoAlpha: 1, duration: 0.1 }, 2.05);
  tl.to("[data-loan]", { x: b.x - POT.mouth.x, y: b.y - POT.mouth.y, duration: 0.55 }, 2.15);
  tl.to("[data-loan]", { autoAlpha: 0, duration: 0.1 }, 2.7);
  tl.to(level, { ...levelAt(POT.levels.lent), duration: 0.6 }, 2.15);

  // 3 to 4: Kiwi repays with a little interest; the pot ends higher than before.
  tl.fromTo("[data-repay]", { autoAlpha: 0, x: 0, y: 0 }, { autoAlpha: 1, duration: 0.1 }, 3.05);
  tl.to("[data-repay]", { x: POT.mouth.x - b.x, y: POT.mouth.y - b.y, duration: 0.55 }, 3.15);
  tl.to("[data-repay]", { autoAlpha: 0, duration: 0.1 }, 3.7);
  tl.to(level, { ...levelAt(POT.levels.repaid), duration: 0.6 }, 3.2);
  tl.fromTo(
    "[data-interest-label]",
    { autoAlpha: 0, y: 6 },
    { autoAlpha: 1, y: 0, duration: 0.25 },
    3.65,
  );
  tl.set({}, {}, 4);

  tally.n = 0;
  writeTally();

  const setActive = (p: number) => {
    const active = Math.min(steps.length - 1, Math.floor(p * steps.length));
    steps.forEach((s, i) => {
      if (i === active) s.dataset.active = "";
      else delete s.dataset.active;
    });
  };
  setActive(0);

  ScrollTrigger.create({
    trigger: track,
    start: "top top",
    end: "bottom bottom",
    scrub: 0.5,
    animation: tl,
    onUpdate: (self) => {
      setActive(self.progress);
      if (progress) progress.style.transform = `scaleX(${self.progress})`;
    },
  });
}
