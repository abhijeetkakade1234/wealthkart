# 0049. Landing page: plain words, one scroll story, GSAP loaded only on `/`

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

The landing page was a placeholder (ADR 0023 left it out of scope, ADR 0025 set the look). The founder asked for "layman words and simple visual and clean premium ness empty spacing gsap and motions interactions". Constraints from earlier decisions: the Gallery look (ADR 0025), no returns in marketing copy (ADR 0024), every state readable and no emojis (ADR 0026), a static export on Cloudflare Pages (ADR 0011), and a phone-first PWA whose `/app` bundle must not grow.

## Decision

**Content.** Eight blocks in this order: hero, how it works (four steps), "one month in a circle" (the signature scroll scene), what your circle can do (save, borrow, leave), why the money is safe (four points plus two honest caveats: lost wallets can't be recovered, AVAX moves in price), who it's for (friends who already do this on WhatsApp and spreadsheets, with three plain facts), a four-question FAQ teaser taken from `/faq` content, and a final call to action. Copy lives in `apps/web/src/content/landing.ts` (ADR 0027 pattern) and is repeated in `/llms-full.txt`. The primary call to action is "Open the app" to `/login/`.

**Visuals.** Cut-paper art only in the hero (the gallery placeholder redrawn as a component, until the illustrator delivers). Everything else is a thin ink line drawing with cobalt marking the one thing that matters: friends around a pot, months ticked off, a vote tally, a notice timeline, a ring of friends. Sections sit about 184px apart on desktop (92px padding each side), more inside the tinted bands.

**Motion, three layers:**

1. **Hero entrance in CSS** (`land-rise`, `land-paper` keyframes): the headline and paper pieces settle in on first paint without waiting for any script, so LCP isn't tied to a JavaScript download.
2. **GSAP 3.15.0 + ScrollTrigger for scroll**, loaded with a dynamic `import()` after `requestIdleCallback`, from a client component that only `/` renders. Section reveals (only for elements below the first screen, so nothing visible blinks), hairlines that draw across, line drawings that trace their strokes, and a slow drift of the hero's paper layers as it scrolls away.
3. **One signature moment:** the "one month" scene. The section becomes a tall track with a sticky stage (CSS `position: sticky`, not a GSAP pin, which is smoother on phones), and one scrubbed timeline plays the month: five friends put in and the pot fills, Kiwi asks and three of four vote yes, the loan goes out and the pot drops, it comes back with a cobalt interest coin and the pot ends higher. The step list highlights the current step (desktop) or shows only that step (phones), with a progress hairline.

**Static first.** The server HTML is the finished page: every section visible, the diagram in its end state, all four steps listed. GSAP marks the page `data-motion="on"` before it hides or rewinds anything, and `revert()` restores the exact markup. With `prefers-reduced-motion` GSAP never loads, the hero keyframes are off, and the page is the static version; turning reduced motion on later reverts the motion on the spot.

**Not used:** Lenis smooth scroll (native scroll is better on phones and keeps the page light), WebGL/Three.js, GSAP's paid-era plugins (none needed; the stroke trace is a few lines of dash offset), and `motion`/Framer for this page.

**Micro-interactions** follow `docs/ui.md` §8–9: pill buttons press to 0.97, the arrow icon nudges right on hover, cards lift 3px with a darker hairline, safety icons tilt slightly, FAQ chevrons rotate. Native `<details>` keeps the FAQ working with no script.

**SEO.** Indexable, canonical `/`, its own description, `Organization` + `WebSite` from the public layout and `SoftwareApplication` on the page. No `FAQPage` markup on `/`: the teaser repeats four answers from `/faq`, which already carries the full `FAQPage` schema.

## Alternatives considered

- **Hero entrance with GSAP:** would wait for the script before the headline is visible and hurt LCP on slow phones. Rejected; CSS does the same stagger.
- **GSAP pin for the scene:** pinning uses fixed positioning and spacer elements that jump on mobile address-bar resizes. Sticky does the same job natively.
- **Importing the shadcn `Button` on the landing page:** it pulls in `radix-ui` client modules and grew the first load of `/` from 107 kB to 190 kB. The landing page uses the same classes on plain links instead.
- **3D hero (per the 3D website guide):** heavier than the phone-first PWA should carry; rejected for now (Phase 4 may revisit, ADR 0025 still governs the look).

## Consequences

- `/` first-load JS: 108 kB (was 107 kB); GSAP, ScrollTrigger and the scene code (about 45 kB gzipped together) load only after idle, only on `/`, and never with reduced motion. `/app` is unchanged.
- E2E scenarios S-LAND-01..06 (`apps/web/e2e/landing.e2e.ts`) and unit checks in `seo.test.ts` cover the page.
- The copy mentions USDT circles and the 3–50 member range (ADR 0046); keep `landing.ts` in step if those change.
- When the illustrator's hero arrives, replace `components/landing/hero-art.tsx`, keeping the `data-depth` layer groups so the drift still works.
