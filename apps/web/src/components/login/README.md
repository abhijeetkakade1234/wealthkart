# apps/web/src/components/login

**What's here:** the sign-in screen at `/login`: cut-paper art on the left, connect Core on the right.
**Open this when:** changing how people sign in or where they land afterwards.

**Key files**

- `login-screen.tsx`: the split layout and the action for each wallet state (no Core, signed out, connecting, wrong network); sends you on once the wallet is ready
- `paper-circle.tsx`: hero art, pieces on a ring with a staggered drop-in (still under reduced motion)
- `safe-next.ts`: `safeNext` / `loginHref`, the return path after sign-in; only `/app/...` paths are allowed (open-redirect guard)
- `__tests__/`: unit tests

There is no account: connecting Core is the login (ADR 0003, 0004). `RequireWallet` sends signed-out visitors here after a short grace period, so returning wallets that are still reconnecting don't bounce.
