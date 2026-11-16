"use client";

import { Wallet } from "lucide-react";
import type { Address } from "viem";

import { TxFor } from "@/components/app/tx-for";
import { Button, InlineAlert } from "@/components/kit";
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
  const w = useVaultAction(circle);
  const { asset } = useCircleAsset(circle);
  if (amount <= 0n) return null;

  async function withdraw() {
    const receipt = await w.send("withdraw");
    if (receipt) {
      notify.success(`Withdrawn. ${fmt(amount, asset)} ${asset.symbol} is in your wallet.`);
      onChanged();
    }
  }

  return (
    <div className="grid gap-4">
      <InlineAlert
        tone="info"
        icon={Wallet}
        title={`${fmt(amount, asset)} ${asset.symbol} is waiting for you`}
        action={
          <Button
            icon={Wallet}
            workingLabel="Withdrawing…"
            state={w.working ? "working" : undefined}
            onClick={withdraw}
          >
            Withdraw
          </Button>
        }
      >
        {asset.symbol === "USDT"
          ? "The circle tried to pay you, but the USDT transfer didn't go through (for example, Tether froze the wallet). It's kept safe here until you withdraw it."
          : "The circle tried to pay you, but your wallet didn't accept it. It's kept safe here until you withdraw it."}
      </InlineAlert>
      <TxFor tx={w.tx} />
    </div>
  );
}
