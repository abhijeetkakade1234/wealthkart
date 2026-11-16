# apps/web/src/components/reminders

**What's here:** the Reminders UI (ADR 0052): the circle card with one switch per reminder kind, the device card on Settings, the shared permission flow and the switch.
**Open this when:** changing how members turn reminders on or choose them.

**Key files**

- `circle-reminders-card.tsx`: on the circle overview (`#reminders`); permission flow, then switches for this circle
- `device-reminders-card.tsx`: on `/app/settings/`; permission flow, wallet, "Send a test", "Turn off on this device"
- `reminder-gate.tsx`: every state before "on": loading, not set up, unsupported browser, iPhone outside the Home Screen, blocked, off, on for another wallet
- `reminder-switch.tsx`: accessible `role="switch"` row

State and API calls live in `src/lib/use-reminders.ts` and `src/lib/push.ts`. The service worker's `push` and `notificationclick` handlers are in `public/sw.js`.
