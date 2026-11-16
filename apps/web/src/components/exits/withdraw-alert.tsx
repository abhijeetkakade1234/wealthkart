"use client";

import { Wallet } from "lucide-react";
import type { Address } from "viem";

import { TxFor } from "@/components/app/tx-for";
import { Button, InlineAlert } from "@/components/kit";
import { useT } from "@/i18n/react";
import { fmt, useCircleAsset } from "@/lib/asset";
import { notify } from "@/lib/toast";
import { useVaultAction } from "@/lib/use-vault-action";

/**
 * A payout the circle tried to send but the wallet refused (RT-20), or USDT that Tether
 * blocked for a frozen wallet (ADR 0046). It waits here until the member withdraws it; the
 * path is the same for both assets.
 */
export function WithdrawAlert({
  circle,
  amount,
  onChanged,
}: {
  circle: Address;
  amount: bigint;
  onChanged: () => void;
}) {
  const { t } = useT();
  const w = useVaultAction(circle);
  const { asset } = useCircleAsset(circle);
  if (amount <= 0n) return null;
  const money = { amount: fmt(amount, asset), symbol: asset.symbol };

  async function withdraw() {
    const receipt = await w.send("withdraw");
    if (receipt) {
      notify.success(t("exits.withdrawnToast", money));
      onChanged();
    }
  }

  return (
    <div className="grid gap-4">
      <InlineAlert
        tone="info"
        icon={Wallet}
        title={t("exits.waitingForYou", money)}
        action={
          <Button
            icon={Wallet}
            workingLabel={t("exits.withdrawing")}
            state={w.working ? "working" : undefined}
            onClick={withdraw}
          >
            {t("exits.withdraw")}
          </Button>
        }
      >
        {asset.symbol === "USDT" ? t("exits.withdrawBodyUsdt") : t("exits.withdrawBodyAvax")}
      </InlineAlert>
      <TxFor tx={w.tx} />
    </div>
  );
}
