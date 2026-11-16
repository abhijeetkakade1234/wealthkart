"use client";

import { circleVaultAbi } from "@wealthkart/sdk";
import { PencilLine } from "lucide-react";
import { useState } from "react";
import type { Address } from "viem";

import { Button, TxTracker } from "@/components/kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { nameChangeAllowedAt } from "@/lib/membership";
import { notify } from "@/lib/toast";
import { useTx } from "@/lib/use-tx";
import { useBufferedWriteContract } from "@/lib/use-buffered-write";

import { DisplayNameField, useNameCheck } from "./display-name-field";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "Your name in this circle": shows the current name and lets the member set or change it. */
export function NameCard({
  circle,
  me,
  name,
  nameChangedAt,
  chainNow,
  onSaved,
}: {
  circle: Address;
  me: Address;
  name: string;
  nameChangedAt: number;
  chainNow: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const check = useNameCheck(circle, me, draft, name);
  const writeContractAsync = useBufferedWriteContract();
  const tx = useTx();
  const lockedUntil = nameChangeAllowedAt(nameChangedAt, chainNow);
  const busy = tx.status === "confirm" || tx.status === "sending";

  async function save() {
    const receipt = await tx.run(() =>
      writeContractAsync({
        abi: circleVaultAbi,
        address: circle,
        functionName: "setDisplayName",
        args: [draft],
      }),
    );
    if (receipt) {
      notify.success(`Saved. You're "${draft}" in this circle now.`);
      setOpen(false);
      tx.reset();
      onSaved();
    }
  }

  return (
    <div className="grid content-start gap-5 rounded-[14px] border border-border bg-card p-[26px]">
      <div className="grid gap-1.5">
        <h3 className="text-[15px] font-semibold">Your name in this circle</h3>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Members see this instead of your wallet address. You can use a different name in each
          circle.
        </p>
      </div>
      <p className="font-display text-[32px] leading-none tracking-tight" data-testid="my-name">
        {name || <span className="text-faint">No name yet</span>}
      </p>
      <div>
        <Button
          variant="secondary"
          icon={PencilLine}
          onClick={() => {
            setDraft(name);
            tx.reset();
            setOpen(true);
          }}
          disabled={lockedUntil !== null}
          disabledReason={
            lockedUntil
              ? `You can change it again on ${dateFmt.format(new Date(lockedUntil * 1000))}`
              : undefined
          }
        >
          {name ? "Change name" : "Pick a name"}
        </Button>
        {lockedUntil && (
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            You can change it again on {dateFmt.format(new Date(lockedUntil * 1000))}.
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{name ? "Change your name" : "Pick your name"}</DialogTitle>
            <DialogDescription>
              After this, you can change it again in 30 days. Your old name stays reserved for you
              for 30 days too.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 pt-2">
            <DisplayNameField value={draft} onChange={setDraft} check={check} />
            <Button
              icon={PencilLine}
              workingLabel="Saving…"
              state={busy ? "working" : undefined}
              onClick={save}
              disabled={check.state !== "available"}
              disabledReason="Pick a free name first"
            >
              Save name
            </Button>
            {tx.status !== "idle" && (
              <TxTracker
                status={tx.status}
                failedAt={tx.failedAt}
                failedMessage={tx.failedMessage}
                explorerUrl={tx.explorerUrl}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
