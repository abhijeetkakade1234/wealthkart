# 0026. Every action gives feedback; every screen handles every state; nothing crashes

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

A premium feel comes from how the app responds, not only how it looks. The founder wants: loaders wherever something waits, buttons that feel pressed, animated icons (no emojis), all UI states handled (success, error, empty, failure and the rest), no crash on server or chain errors, no overlapping or confusing layout, toasts where needed, and **all messages in plain language**.

## Decision

1. **Loaders everywhere something waits.** Skeletons for content, an inline spinner inside the button for actions, a step-by-step tracker for blockchain transactions. Nothing appears frozen.
2. **Buttons feel pressed.** On press: scale to 0.97, slight darkening, icon micro-animation; while working: spinner replaces the icon, label changes ("Paying…"), button disabled (no double submits); on finish: brief check or cross icon.
3. **Icons only, no emojis.** lucide-react throughout; icons animate on interaction (e.g. send icon nudges, check draws in, refresh spins). All motion respects `prefers-reduced-motion`.
4. **Eight UI states**, handled by every data-driven component: loading · success (data) · empty · error (recoverable, retry) · failed transaction · partial/stale (cached data, live source down) · offline · access (no wallet / wrong network / not a member). Plus a pending state for transactions.
5. **Never crash.** Error boundaries at app, layout and widget level: a broken widget shows its own error card while the rest of the page keeps working. All RPC, indexer and contract calls go through one wrapper that converts failures into friendly errors. A global handler catches unhandled promise rejections.
6. **No overlapping layout.** A fixed z-index scale, one toast region, one modal at a time, sticky elements reserve their own space, and long text wraps or truncates with a tooltip.
7. **Toasts** for results of actions (paid, voted, copied, failed); inline alerts for things that need attention on the page (you owe, you're on the wrong network). Never a toast for something the user must act on later.
8. **Plain language.** Every message says what happened and what to do next, with no jargon or error codes in the main text. Technical details sit behind a "Details" toggle for support. A message catalogue maps every technical error to a human sentence.

## Consequences

Shared components: `Button` (press, loading, done states), `AnimatedIcon`, `StateView` (renders any of the eight states), `TxTracker`, `ErrorBoundary`, `Toast` helpers, a `messages` catalogue. Full spec: `docs/ui.md` §8–12. Tests: S-UX-* in `docs/testing.md`.
