"use client";

import { Droplets } from "lucide-react";

import { Button } from "@/components/kit";
import { fmt } from "@/lib/asset";
import { messages } from "@/lib/messages";
import { notify } from "@/lib/toast";
import { useTestUsdtFaucet } from "@/lib/use-test-usdt";
import { cn } from "@/lib/utils";

const USDT = { token: null, symbol: "USDT", decimals: 6 } as const;

/**
 * "Get test USDT" (ADR 0053). Renders nothing unless this is a test network build whose factory
 * USDT is the faucet token. Says plainly that the money has no value.
 */
export function TestUsdtFaucet({
  onMinted,
  className,
}: {
  /** Called after the mint is mined, e.g. to re-read the wallet's USDT balance. */
  onMinted?: () => void;
  className?: string;
}) {
  const f = useTestUsdtFaucet();
  if (!f.visible) return null;
  const shown = `${fmt(f.amount, USDT)} USDT`;
  const working = f.tx.status === "confirm" || f.tx.status === "sending";

  return (
    <div
      data-testid="test-usdt-faucet"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-[12px] border border-dashed border-border bg-card px-6 py-5",
        className,
      )}
    >
      <p className="max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
        {messages.testUsdtNote(shown)}
      </p>
      <Button
        size="sm"
        variant="secondary"
        icon={Droplets}
        iconAnimation="lift"
        workingLabel="Adding…"
        state={working ? "working" : undefined}
        onClick={async () => {
          const ok = await f.mint();
          if (ok) {
            notify.success(messages.testUsdtAdded(fmt(f.amount, USDT)));
            onMinted?.();
          }
        }}
      >
        Get test USDT
      </Button>
      {f.tx.status === "failed" && f.tx.failedMessage && (
        <p role="alert" className="basis-full text-[13px] text-bad">
          {f.tx.failedMessage}
        </p>
      )}
    </div>
  );
}
