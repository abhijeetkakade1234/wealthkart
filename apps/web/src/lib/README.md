# apps/web/src/lib

**What's here:** non-visual app logic: chain hooks, forms, messages, transaction tracking.
**Open this when:** reading or writing chain data, or changing user-facing messages.

**Key files**

- `circle.ts`: factory and circle read hooks, `parseCircleId`, page sizes, `NEXT_PUBLIC_FACTORY_OVERRIDE` for local chains
- `circle-form.ts`: create-circle form state and validation (mirrors contract bounds)
- `messages.ts`: plain-language message catalogue, `toFriendlyError`
- `use-tx.ts`: confirm, sending, confirmed or failed for one transaction
- `safe-call.ts`, `toast.ts`, `utils.ts`: safe async wrapper, toasts, `cn()`
- `wagmi.ts`: Core-only wallet config; `NEXT_PUBLIC_RPC_URL` override for local chains
- `seo/`: metadata, JSON-LD, llms and OG helpers (own README)
- `__tests__/`: unit tests
