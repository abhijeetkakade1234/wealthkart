# apps/web/src/lib

**What's here:** non-visual app logic: chain hooks, forms, messages, transaction tracking.
**Open this when:** reading or writing chain data, or changing user-facing messages.

**Key files**

- `asset.ts`: the circle's money, AVAX (18 decimals) or USDT (6), from `vault.asset()` (ADR 0046): `useCircleAsset`, `fmt`/`money`/`parseAmount`/`toNumber`, `useTokenBalance`. Every amount goes through it; never assume wei
- `faucet.ts`: when "Get test USDT" may show (`testUsdtFaucetVisible`: not mainnet, chain 43113, factory USDT with `MINT_CAP`) and how much one tap mints; `use-test-usdt.ts` is the hook (ADR 0053)
- `use-asset-payment.ts`: pays the circle in its asset: AVAX with `value`; USDT balance check, approve (installments up to installment + both fees, ADR 0048), then pay, re-approving once on `TokenAllowanceTooLow`
- `circle.ts`: factory and circle read hooks (each circle's `asset` included), `useFactoryUsdt`, per-asset portfolio totals, `parseCircleId`, page sizes, `NEXT_PUBLIC_FACTORY_OVERRIDE` for local chains
- `analytics.ts`: pure chart and heatmap shaping from circle events (ADR 0034)
- `events.ts`: reads a circle's events from the chain in block chunks (`useCircleEvents`)
- `gov-hooks.ts`: exits, guardian and governance reads (`useCircleGov`, `useProposals`, `useMemberOptions`)
- `governance.ts`: pure mirrors of Governance and Exits (proposal outcome, tally text, exit phase, waiver months)
- `loans.ts`: pure LoanBook mirrors: limits, interest preview (rules engine), tenor timeline, defaultable, repay checks, loans from events, list filters, chart shaping
- `loan-hooks.ts`: every loan read and write in one place (`useMyLoan`, `useOpenLoanRequests`, `useLoanTx`, ...), ADR 0044
- `use-block-times.ts`: block timestamps for a page of rows, `formatWhen` (UTC)
- `feed.ts`: activity feed sentences for every vault event, including loans
- `rules.ts`: `Rules.Params` mirror: defaults, plain-words formatting, `ruleDiff`, `rulesProblem` (bounds of `Rules.validate`), form parsing
- `use-vault-action.ts`: one typed vault write with its tracker state
- `circle-form.ts`: create-circle form state and validation (mirrors contract bounds): asset AVAX or USDT, member cap 3..50 (default 12, note above 20), quorum 20..100, and the loan/vote/notice rules checked by `rulesProblem`
- `templates.ts`: circle templates (Friends, Family, Office, Custom) as data; apply, asset switch, change count, plain summary (ADR 0054)
- `first-run.ts`: first-run checklist items and per-wallet localStorage state, try/catch wrapped (ADR 0054); the backup wallet item is a chain read (ADR 0056)
- `nominee.ts`: pure backup wallet (nominee) rules: address problems, claim notice (>= 30 days), claim phase, queue position (ADR 0056)
- `nominee-hooks.ts`: `useMyBackupWallet`, `useNamedBy` (who named this wallet, via `nomineeOf` over the member list), `useExitQueue`, `useBackupCoverage` (checklist)
- `messages.ts`: plain-language message catalogue, `toFriendlyError`
- `use-tx.ts`: confirm, sending, confirmed or failed for one transaction (keeps the failure code for retries)
- `safe-call.ts`, `toast.ts`, `utils.ts`: safe async wrapper, toasts, `cn()`
- `wagmi.ts`: Core-only wallet config; `TARGET_CHAIN` from `NEXT_PUBLIC_NETWORK` (`fuji` default, or `mainnet`, ADR 0051); `NEXT_PUBLIC_RPC_URL` override for local chains
- `seo/`: metadata, JSON-LD, llms and OG helpers (own README)
- `__tests__/`: unit tests
