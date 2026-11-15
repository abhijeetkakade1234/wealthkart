"use client";

import { shortAddress } from "@wealthkart/sdk";
import { ShieldCheck } from "lucide-react";
import type { Address } from "viem";

import { TxFor } from "@/components/app/tx-for";
import { Avatar } from "@/components/art";
import { Button } from "@/components/kit";
import { type LoanRequestView, useLoanTx } from "@/lib/loan-hooks";
import { avax } from "@/lib/loans";
import { notify } from "@/lib/toast";

/**
 * Someone named you as their guarantor (rule 11): what backing a loan means and "Back this
 * loan". Naming ties nobody; only accepting does (ADR 0038).
 */
export function GuarantorNotice({
  circle,
  request: r,
  onChanged,
}: {
  circle: Address;
  request: LoanRequestView;
  onChanged: () => void;
}) {
  const action = useLoanTx(circle);
  const who = r.borrowerName || shortAddress(r.borrower);

  async function accept() {
    const ok = await action.acceptGuarantee(r.borrower);
    if (ok) {
      notify.success(`You're backing ${who}'s loan.`);
      onChanged();
    }
  }

  return (
    <section
      aria-label="Asked to be a guarantor"
      data-testid="guarantor-notice"
      className="grid gap-6 rounded-[14px] border border-brand/15 bg-brand-soft p-[26px] sm:p-8"
    >
      <div className="flex items-start gap-4">
        <Avatar address={r.borrower} size={40} />
        <div className="grid gap-1.5">
          <h3 className="text-[15px] font-semibold">
            {who} asked you to back a {r.medical ? "medical " : ""}loan of {avax(r.amount)} AVAX
          </h3>
          <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-foreground/80">
            Backing it means your savings count towards their limit. If they stop paying and the
            loan is marked as defaulted, you&apos;re frozen too: you can&apos;t leave or borrow, and
            the circle can vote to use your share to repay what their savings don&apos;t cover. You
            stay tied until the loan is repaid. If you do nothing, the request simply can&apos;t go
            ahead.
          </p>
        </div>
      </div>
      <div className="grid gap-4">
        <div>
          <Button
            icon={ShieldCheck}
            workingLabel="Agreeing…"
            state={action.working ? "working" : undefined}
            onClick={accept}
          >
            Back this loan
          </Button>
        </div>
        <TxFor tx={action.tx} />
      </div>
    </section>
  );
}
