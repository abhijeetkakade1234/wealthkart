# components/landing

**What's here:** the landing page at `/` (ADR 0049): its sections, the cut-paper hero, the line diagrams and the GSAP motion layer.
**Open this when:** changing the landing page. Copy lives in `src/content/landing.ts`, not here.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `sections.tsx`       | Server components for every section: hero, steps, one month, features, safety, audience, FAQ, CTA   |
| `hero-art.tsx`       | Placeholder cut-paper hero (until the illustrator's piece); layers carry `data-depth` for the drift |
| `pot-diagram.tsx`    | "One month in a circle" line diagram, rendered in its end state                                     |
| `geometry.ts`        | Positions shared by the diagram and the timeline (no imports, keeps the motion chunk small)         |
| `diagrams.tsx`       | Small card drawings: months, vote tally, notice timeline, ring of friends                           |
| `landing-motion.tsx` | Client component: after idle, dynamically imports GSAP + ScrollTrigger; skipped with reduced motion |
| `motion.ts`          | Reveals, hairlines, stroke tracing, hero drift and the scrubbed month scene; `revert()` undoes all  |
| `landing.css`        | Hero entrance keyframes, micro-interactions, sticky track styles under `[data-motion="on"]`         |

**Rules**

- The HTML must read correctly with no script and with reduced motion. Motion hooks are data attributes only (`data-reveal`, `data-line`, `data-draw`, `data-pop`, `data-depth`, `data-month-*`, `data-step`).
- Don't import `components/ui/*` here: they pull `radix-ui` client code into `/`. Copy the classes.
- Art palette only in `hero-art.tsx`; everything else is ink plus the cobalt accent.
- Tests: S-LAND-01..07 (`e2e/landing.e2e.ts`, `src/lib/__tests__/seo.test.ts`).
