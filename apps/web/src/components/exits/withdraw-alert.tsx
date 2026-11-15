"use client";

import { formatAvax } from "@wealthkart/sdk";
import { Wallet } from "lucide-react";
import type { Address } from "viem";

import { TxFor } from "@/components/app/tx-for";
import { Button, InlineAlert } from "@/components/kit";
import { notify } from "@/lib/toast";
import { useVaultAction } from "@/lib/use-vault-action";

/**
 * AVAX the circle tried to send but the wallet refused (RT-20). It waits here until the member
 * withdraws it.
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
  if (amount <= 0n) return null;

  async function withdraw() {
    const receipt = await w.send("withdraw");
    if (receipt) {
      notify.success(`Withdrawn. ${formatAvax(amount)} AVAX is in your wallet.`);
      onChanged();
    }
  }

  return (
    <div className="grid gap-4">
      <InlineAlert
        tone="info"
        icon={Wallet}
        title={`${formatAvax(amount)} AVAX is waiting for you`}
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
        The circle tried to pay you, but your wallet didn&apos;t accept it. It&apos;s kept safe here
        until you withdraw it.
      </InlineAlert>
      <TxFor tx={w.tx} />
    </div>
  );
}
