"use client";

import { shortAddress } from "@wealthkart/sdk";
import { BadgeCheck, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/art";
import { LanguageMenu } from "@/components/app/language-switcher";
import { StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { useT } from "@/i18n/react";
import { parseAddress, recordSummary, useRecord } from "@/lib/record";

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
  const { t, formatDate } = useT();

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
        <div className="flex items-center gap-3">
          <LanguageMenu />
          <Link href="/app/" className="text-[14px] text-muted-foreground hover:text-foreground">
            {t("record.openApp")}
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-[880px] gap-12 px-6 pb-24 pt-10">
        <div className="grid gap-4">
          <h1 className="font-display text-[44px] leading-[1.05] tracking-tight">
            {t("record.title")}
          </h1>
          <p className="max-w-[560px] text-[15px] leading-relaxed text-muted-foreground">
            {t("record.intro")}
          </p>
        </div>

        <form onSubmit={look} className="flex flex-wrap gap-3" role="search">
          <label className="relative min-w-[260px] flex-1">
            <span className="sr-only">{t("record.addressLabel")}</span>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-faint"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("record.addressPlaceholder")}
              className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-4 font-mono text-[14px] outline-none placeholder:font-sans placeholder:text-faint focus:border-foreground/40"
              aria-invalid={invalid}
            />
          </label>
          <button
            type="submit"
            disabled={invalid || input.trim() === ""}
            className="h-12 rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {t("record.lookUp")}
          </button>
          {invalid && <p className="w-full text-[13px] text-bad">{t("record.notAnAddress")}</p>}
        </form>

        {!wallet ? (
          <StateView state="empty" message={t("record.pasteAddress")} />
        ) : r.noFactory ? (
          <StateView state="empty" message={t("record.notLive")} />
        ) : r.isPending ? (
          <StateView
            state="loading"
            label={t("record.reading")}
            skeleton={<Skeleton className="h-72 rounded-[14px]" />}
          />
        ) : r.isError || !r.record ? (
          <StateView state="error" onRetry={r.refetch} />
        ) : (
          <section
            className="grid gap-10 rounded-[14px] border border-border bg-card p-[26px] sm:p-10"
            aria-label={t("record.region")}
            data-testid="record"
          >
            <header className="flex flex-wrap items-center gap-4">
              <Avatar address={wallet} size={48} />
              <div className="grid gap-1">
                <span className="font-mono text-[14px]">{shortAddress(wallet)}</span>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <BadgeCheck className="size-3.5 text-brand" strokeWidth={1.75} aria-hidden />
                  {t("record.locked")}
                </span>
              </div>
            </header>

            <p className="font-display text-[30px] leading-tight tracking-tight sm:text-[34px]">
              {recordSummary(r.record)}
            </p>

            <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
              <Fact label={t("record.monthsOnTime")} value={String(r.record.onTime)} />
              <Fact label={t("record.monthsLate")} value={String(r.record.late)} />
              <Fact label={t("record.circles")} value={String(r.record.circles)} />
              <Fact label={t("record.loansRepaid")} value={String(r.record.loansRepaid)} />
              <Fact label={t("record.defaults")} value={String(r.record.defaults)} />
              <Fact
                label={t("record.since")}
                value={
                  r.record.firstSeen
                    ? formatDate(r.record.firstSeen * 1000, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      })
                    : "–"
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
