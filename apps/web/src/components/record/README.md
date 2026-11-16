# src/components/record

**What's here:** the public repayment record page (ADR 0042), at `/record/?address=`.
**Open this when:** changing how a wallet's soulbound record is shown.

**Key files**

- `record-screen.tsx`: address lookup, summary line, counters; works without a wallet (reads the target chain); data from `src/lib/record.ts`
