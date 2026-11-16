"use client";

import { shortAddress } from "@wealthkart/sdk";
import { BadgeCheck, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/art";
import { StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { parseAddress, recordSummary, useRecord } from "@/lib/record";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Public repayment record (ADR 0042): anyone with a link can see a wallet's soulbound track
 * record across every WealthKart circle. Only addresses, never names: the record holds no
 * personal data.
 */
export function RecordScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { address: connected } = useCoreWallet();
  const fromUrl = parseAddress(params.get("address"));
  const wallet = fromUrl ?? (connected ? (connected as `0x${string}`) : null);
  const [input, setInput] = useState(fromUrl ?? "");
  const r = useRecord(wallet);

  useEffect(() => {
    if (fromUrl) setInput(fromUrl);
  }, [fromUrl]);

  function look(e: React.FormEvent) {
    e.preventDefault();
    const a = parseAddress(input.trim());
    if (!a) return;
    router.replace(`${pathname}?address=${a}`, { scroll: false });
  }
  const invalid = input.trim() !== "" && !parseAddress(input.trim());

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-[68px] max-w-[880px] items-center justify-between px-6">
        <Link href="/" className="font-display text-[22px] tracking-tight">
          WealthKart
        </Link>
        <Link href="/app/" className="text-[14px] text-muted-foreground hover:text-foreground">
          Open the app
        </Link>
      </header>

      <main className="mx-auto grid max-w-[880px] gap-12 px-6 pb-24 pt-10">
        <div className="grid gap-4">
          <h1 className="font-display text-[44px] leading-[1.05] tracking-tight">
            Repayment record
          </h1>
          <p className="max-w-[560px] text-[15px] leading-relaxed text-muted-foreground">
            Every circle writes how a wallet pays: months on time, loans repaid, defaults. It lives
            on the blockchain, nobody can edit it, and it can&apos;t be sold or moved to another
            wallet.
          </p>
        </div>

        <form onSubmit={look} className="flex flex-wrap gap-3" role="search">
          <label className="relative min-w-[260px] flex-1">
            <span className="sr-only">Wallet address</span>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-faint"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Wallet address, 0x…"
              className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-4 font-mono text-[14px] outline-none placeholder:font-sans placeholder:text-faint focus:border-foreground/40"
              aria-invalid={invalid}
            />
          </label>
          <button
            type="submit"
            disabled={invalid || input.trim() === ""}
            className="h-12 rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            Look up
          </button>
          {invalid && (
            <p className="w-full text-[13px] text-bad">That isn&apos;t a wallet address.</p>
          )}
        </form>

        {!wallet ? (
          <StateView
            state="empty"
            message="Paste a wallet address, or connect your wallet in the app to see your own record."
          />
        ) : r.noFactory ? (
          <StateView state="empty" message="WealthKart isn't live on this network yet." />
        ) : r.isPending ? (
          <StateView
            state="loading"
            label="Reading the record"
            skeleton={<Skeleton className="h-72 rounded-[14px]" />}
          />
        ) : r.isError || !r.record ? (
          <StateView state="error" onRetry={r.refetch} />
        ) : (
          <section
            className="grid gap-10 rounded-[14px] border border-border bg-card p-[26px] sm:p-10"
            aria-label="Record"
            data-testid="record"
          >
            <header className="flex flex-wrap items-center gap-4">
              <Avatar address={wallet} size={48} />
              <div className="grid gap-1">
                <span className="font-mono text-[14px]">{shortAddress(wallet)}</span>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <BadgeCheck className="size-3.5 text-brand" strokeWidth={1.75} aria-hidden />
                  Locked to this wallet
                </span>
              </div>
            </header>

            <p className="font-display text-[30px] leading-tight tracking-tight sm:text-[34px]">
              {recordSummary(r.record)}
            </p>

            <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
              <Fact label="Months on time" value={String(r.record.onTime)} />
              <Fact label="Months late" value={String(r.record.late)} />
              <Fact label="Circles" value={String(r.record.circles)} />
              <Fact label="Loans repaid" value={String(r.record.loansRepaid)} />
              <Fact label="Defaults" value={String(r.record.defaults)} />
              <Fact
                label="Since"
                value={
                  r.record.firstSeen ? dateFmt.format(new Date(r.record.firstSeen * 1000)) : "–"
                }
              />
            </dl>
          </section>
        )}
      </main>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="font-display text-[30px] leading-none tabular">{value}</dd>
    </div>
  );
}
