"use client";

import { shortAddress } from "@wealthkart/sdk";
import { ShieldCheck } from "lucide-react";
import type { Address } from "viem";

import { TxFor } from "@/components/app/tx-for";
import { Avatar } from "@/components/art";
import { Button } from "@/components/kit";
import { useT } from "@/i18n/react";
import { money, useCircleAsset } from "@/lib/asset";
import { type LoanRequestView, useLoanTx } from "@/lib/loan-hooks";
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
  const { t } = useT();
  const { asset } = useCircleAsset(circle);
  const who = r.borrowerName || shortAddress(r.borrower);

  async function accept() {
    const ok = await action.acceptGuarantee(r.borrower);
    if (ok) {
      notify.success(t("loans.backingToast", { name: who }));
      onChanged();
    }
  }

  return (
    <section
      aria-label={t("loans.guarantorNotice.aria")}
      data-testid="guarantor-notice"
      className="grid gap-6 rounded-[14px] border border-brand/15 bg-brand-soft p-[26px] sm:p-8"
    >
      <div className="flex items-start gap-4">
        <Avatar address={r.borrower} size={40} />
        <div className="grid gap-1.5">
          <h3 className="text-[15px] font-semibold">
            {t(r.medical ? "loans.guarantorNotice.titleMedical" : "loans.guarantorNotice.title", {
              name: who,
              amount: money(r.amount, asset),
            })}
          </h3>
          <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-foreground/80">
            {t("loans.guarantorNotice.body")}
          </p>
        </div>
      </div>
      <div className="grid gap-4">
        <div>
          <Button
            icon={ShieldCheck}
            workingLabel={t("loans.agreeing")}
            state={action.working ? "working" : undefined}
            onClick={accept}
          >
            {t("loans.backThisLoan")}
          </Button>
        </div>
        <TxFor tx={action.tx} />
      </div>
    </section>
  );
}
