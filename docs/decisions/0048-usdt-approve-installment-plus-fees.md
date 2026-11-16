# 0048. USDT installments approve the installment plus both late fees

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

ADR 0046 says the app asks for an exact allowance before each USDT payment. For installments that has a sharp edge. The amount due jumps at fixed UTC moments: the first late fee starts right after 23:59:59 UTC on the due day, the second after `secondFeeDay`. A member who approves the exact amount a minute before midnight UTC, then confirms the payment a minute after, has the payment refused with `TokenAllowanceTooLow` and has to approve again (a second wallet prompt and a second network fee). The contract review asked the app to remove that trap.

## Decision

- For `contribute` in a USDT circle the app approves `installment + fee1 + fee2`, read fresh from the vault right before approving (or the amount due, if that is ever higher). Each fee is capped on-chain at half the installment (ADR 0030), so the ceiling is at most twice the installment.
- The vault still pulls only the exact amount due. Paying on time leaves `fee1 + fee2` of allowance unused; the next payment approves again only if the remaining allowance doesn't cover what is due.
- `payInterest` and `repay(amount)` keep the exact amount. The `TokenAllowanceTooLow` fallback stays for all three: the app simulates the payment after approving, and if the allowance fell short it re-reads the amount and approves once more.
- The approve step says "Approve up to ..." and the Pay page says in one line that the circle only takes what is due.
- Never an unlimited allowance.

## Alternatives considered

- **Exact allowance and the retry only (ADR 0046 as written).** Works, but costs a second approval exactly when a member is already late.
- **Unlimited approval once.** Fewer prompts, but any vault bug or a future migration mistake could pull a member's whole USDT balance. Rejected in ADR 0046 and still rejected.
- **Approve a month or more ahead.** Larger standing allowances for no real gain; the monthly approve is cheap on Avalanche.

## Consequences

- A member may hold a small leftover allowance to their own circle (at most two late fees). It is bounded and only that circle can use it, and only for amounts the contract itself decides.
- Interest payments can still hit the retry path if a late fee starts in between; that is rare and handled.
- Partly supersedes the "exact allowance" sentence of ADR 0046 for installments only.
