# components/art

**What's here:** placeholder cut-paper illustration (ADR 0025) and the generators that turn a wallet or circle address into art.
**Open this when:** you need an avatar, a circle cover or an empty-state spot, or the illustrator's files arrive.

| File         | Purpose                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `pieces.tsx` | Hand-drawn SVG pieces (Leaf, Sun, Bird, Flower, Hill, Wave, Coin, Pot), each in a 100×100 box        |
| `palette.ts` | The seven art colours as CSS variables (`--art-*`). Art only, never UI chrome                        |
| `seed.ts`    | `seedFromAddress` (FNV-1a, case-insensitive) and a small PRNG. No `Math.random`, no network          |
| `specs.ts`   | Pure functions that decide what to draw: `avatarSpec`, `coverSpec`, `EMPTY_SCENES`                   |
| `art.tsx`    | `<Avatar address size label?>`, `<CircleCover address name>`, `<EmptyArt variant>`                   |
| `__tests__/` | S-WEB-30..34: same address same art, spread across variants, palette and frame bounds, accessibility |

**Rules**

- Art goes only on the hero, circle covers, empty states and avatars. Never in tables of numbers, forms or money decisions.
- Avatars are decorative unless you pass `label`; the member's name next to it is the accessible text.
- Covers use `preserveAspectRatio="xMaxYMid slice"`: size the box with CSS and the art fills it, weighted to the right.
- Empty-state scenes are fixed (not seeded) so a screen always looks the same.

**Replacing the placeholders:** the illustrator delivers SVGs on the same 100×100 box with `base` and `cut` layers (`docs/design/illustrator-brief.md`). Swap each piece's paths in `pieces.tsx`, keep the names and the `color` / `detail` props, and the generators keep working.

Showcase: `/kit` → "Cut-paper art".
