# 0002. Contributions in AVAX held in an on-chain vault per circle

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

G1 pays INR into a bank account and an admin records it in a sheet, so trust rests on one person. An earlier draft kept INR in the bank with the chain as a ledger only.

## Decision

Members contribute **AVAX directly** (installment fixed in AVAX, no INR conversion) into a vault contract per circle. Loans, repayments, interest, penalties and exits all move AVAX on-chain. Contracts are written asset-agnostic so USDC can be added later.

## Alternatives considered

- INR in the bank with an on-chain ledger and admin attestations: lower legal risk, but trust stays with admins; rejected by the founders.
- INR-pegged installments converted at the day's price: needs an oracle and confuses members; rejected.

## Consequences

The transfer itself is the proof of payment. Contracts custody real funds, so an **external audit is mandatory before mainnet**. Member value fluctuates with the AVAX price; the UI must say so. Crypto tax applies to members.
