# components/kit

**What's here:** the interaction kit (ADR 0026, `docs/ui.md` §8–12): buttons that react to a press, animated icons, the eight UI states, the transaction tracker, error boundaries, inline alerts and the toast region. Import from `@/components/kit`.
**Open this when:** a screen needs to wait, fail, be empty, be offline, ask for a wallet, or report a result. The `/kit` page (`src/app/kit/`) shows every component in every state.

**Key files**

| Path                        | Purpose                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `button.tsx`                | `Button`: idle → pressed → working → done / failed; blocks double submits; `disabledReason` tooltip |
| `animated-icon.tsx`         | `AnimatedIcon` (nudge, draw, spin, lift, rotate) and `DrawCheck`; reduced-motion aware              |
| `state-view.tsx`            | `StateView`: loading, success, empty, error, failed, stale, offline, access                         |
| `tx-tracker.tsx`            | `TxTracker`: Confirm in Core → Sending → Confirmed (+ failed), explorer link                        |
| `error-boundary.tsx`        | `ErrorBoundary` with `app`, `page` and `widget` presets; raw errors only behind "Details"           |
| `inline-alert.tsx`          | `InlineAlert` (info / warn / bad) for in-page attention                                             |
| `details.tsx`               | "Details" toggle for technical text                                                                 |
| `toaster.tsx`               | The single sonner `Toaster` (bottom-right desktop, top on phones), mounted in the root layout       |
| `global-error-handlers.tsx` | `unhandledrejection` / `error` listeners that show a friendly toast                                 |
| `index.ts`                  | Public exports                                                                                      |
| `__tests__/`                | S-UX-01, S-UX-02, S-UX-04 tests                                                                     |

**Rules:** every user-facing string comes from `@/lib/messages`; no emojis (lint enforces it); lucide icons at 1.5px stroke; motion stays at 150–300 ms and switches off with `prefers-reduced-motion`. Data calls go through `@/lib/safe-call`, results are reported with `notify` from `@/lib/toast`.
