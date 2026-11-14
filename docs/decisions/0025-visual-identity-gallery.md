# 0025. Visual identity: "Gallery" (calm premium light UI + folk-art illustration)

- **Status:** Accepted
- **Date:** 2026-11-14
- **Supersedes:** the "look and feel" parts of ADR 0023 (dark-first, Magic UI / Aceternity glow effects). The rest of 0023 (shadcn/ui, one layout, pagination, search) still stands.

## Context
Three rounds were rejected: dark glow-card palettes ("AI slop"), material themes (terminal, receipt, snowfield, riso, ledger), and a fully folk-art UI. The founder's reference was a cut-paper folk-art site. What they liked was **the illustration**. They want the product **light**, **premium and calm**, with **generous whitespace** ("empty spacing is what makes it feel premium SaaS").

## Decision
**Interface: quiet, near-monochrome, light.**
| Token | Value | Use |
|---|---|---|
| `--bg` | `#FAFAF8` | page |
| `--surface` | `#FFFFFF` | cards, panels |
| `--line` / `--line-2` | `#E7E6E1` / `#F0EFEB` | borders, row dividers |
| `--ink` | `#15161A` | text, primary button |
| `--muted` / `--faint` | `#6C6E75` / `#9A9CA2` | secondary text |
| `--accent` / `--accent-soft` | `#2C4596` / `#EEF1FA` | links, active nav, votes |
| `--good` / soft | `#2D6A4F` / `#EAF3EE` | paid, yes |
| `--warn` / soft | `#A8701A` / `#FBF3E4` | due, holiday |
| `--bad` / soft | `#C2391F` / `#FCEDE9` | late, default |

**Illustration palette (art only, never UI chrome):** mustard `#D79922`, red `#F13C20`, cobalt `#4056A1`, periwinkle `#C5CBE3`, cream `#EFE2BA`, olive `#7C7B26`, forest `#1F5A3A`.

**Type:** Instrument Serif (display, page titles, big numbers) · Hanken Grotesk (all interface text) · Geist Mono (addresses, times, tx IDs).

**Shape:** radius 14px cards / 10px small / pill buttons and chips; 1px hairline borders; at most one very soft shadow on the app frame; no gradients, glows or glassmorphism.

**Spacing (hard requirement):** 8px scale, generous by default. Sections 160–180px apart on marketing pages; app content padding 40px (22px on phones); cards 26–32px inside; table rows ~18px vertical padding. When crowded, add space rather than shrinking text.

**Illustration:** hand-cut folk-art style (from the reference) used only on: landing hero, circle cover banners (a unique composition per circle, chosen from a piece set by the circle's address), phone home, onboarding, empty states, and member avatars (small shapes generated from the wallet address). Never inside tables, forms or money-decision UI.

**Theme:** light is the product look. A dark theme is not planned for launch; if added later it must be designed, not inverted.

## Alternatives considered
- Dark-first web3 with glow effects (ADR 0023's original look): rejected as generic.
- Material themes and a fully folk-art UI: rejected; too loud for a money app.

## Consequences
- shadcn theme tokens = the table above; fonts loaded via `next/font/google`.
- Magic UI / Aceternity are not used. Motion is limited to subtle transitions (number count-up, fade/slide on route change) and respects `prefers-reduced-motion`.
- **Commission an illustrator** for 1 hero plus 20–30 cut-paper pieces (SVG, using the art palette). Until then, the SVG placeholders in `docs/design/gallery.html` are used.
- Reference implementation: `docs/design/gallery.html`.
