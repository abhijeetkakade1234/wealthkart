"use client";

import { circleVaultAbi, shortAddress } from "@wealthkart/sdk";
import { Gavel, Scale, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";

import { Pagination, usePageParam } from "@/components/app/pagination";
import { TxFor } from "@/components/app/tx-for";
import { Avatar, EmptyArt } from "@/components/art";
import { Button, InlineAlert, StateView } from "@/components/kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/react";
import { useCircleAsset } from "@/lib/asset";
import { useCircleEvents } from "@/lib/events";
import {
  type BorrowerState,
  type LoanRequestView,
  useBorrowerStates,
  useLoanTx,
} from "@/lib/loan-hooks";
import {
  avax,
  filterLoans,
  isDefaultable,
  LOAN_FILTERS,
  LOAN_SORTS,
  LOAN_TYPES,
  type LoanFilter,
  type LoanRecord,
  type LoanSort,
  type LoanType,
  loansFromLogs,
  pickParam,
  rateIn,
  sortLoans,
} from "@/lib/loans";
import { formatBps, type RulesParams } from "@/lib/rules";
import { notify } from "@/lib/toast";
import { formatWhen, useBlockTimes } from "@/lib/use-block-times";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

import { StatusPill } from "./parts";
import "@/i18n/en/loans";

const PAGE_SIZE = 10;
const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * All loans of the circle (docs/ui.md §4): status and type filters, sort, and a 300 ms debounced
 * search by borrower, all kept in the URL. Built from the circle's events; running loans add
 * live state from the chain for the rate and the "Mark as defaulted" action.
 */
export function LoansList({
  circle,
  me,
  rules,
  currentPeriod,
  openRequests,
  dissolved,
  onChanged,
}: {
  circle: Address;
  me: Address | undefined;
  rules: RulesParams;
  currentPeriod: number;
  openRequests: readonly LoanRequestView[];
  /** After a dissolve a defaulted loan is settled at once, by anyone, with no vote. */
  dissolved: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { asset } = useCircleAsset(circle);
  const params = useSearchParams();
  const page = usePageParam();
  const q = useCircleEvents(circle);
  const { t, tn } = useT();

  const status = pickParam<LoanFilter>(params.get("status"), LOAN_FILTERS);
  const type = pickParam<LoanType>(params.get("type"), LOAN_TYPES);
  const sort = pickParam<LoanSort>(params.get("sort"), LOAN_SORTS);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebounced(search, 300);

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (debounced === current) return;
    const next = new URLSearchParams(params.toString());
    if (debounced) next.set("q", debounced);
    else next.delete("q");
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [debounced, params, pathname, router]);

  function setParam(key: string, value: string, fallback: string) {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const records = useMemo(() => (q.data ? loansFromLogs(q.data.logs) : []), [q.data]);
  const people = useMemo(
    () =>
      [
        ...new Set(records.flatMap((r) => [r.borrower, r.guarantor]).map((a) => a.toLowerCase())),
      ].filter((a) => a !== ZERO),
    [records],
  );
  const names = useReadContracts({
    allowFailure: true,
    contracts: people.map(
      (p) =>
        ({
          abi: circleVaultAbi,
          address: circle,
          functionName: "nameOf",
          args: [p as Address],
        }) as const,
    ),
    query: { enabled: people.length > 0 },
  });
  const nameMap = new Map<string, string>();
  people.forEach((p, i) => {
    const r = names.data?.[i];
    if (r?.status === "success" && r.result) nameMap.set(p, r.result as string);
  });
  const name = (a: string) => nameMap.get(a.toLowerCase()) || shortAddress(a);

  const running = useMemo(
    () => [
      ...new Set(
        records
          .filter((r) => r.status === "active" || r.status === "default")
          .map((r) => r.borrower),
      ),
    ],
    [records],
  );
  const live = useBorrowerStates(circle, running);
  const stateOf = (r: LoanRecord): BorrowerState | undefined =>
    r.status === "active" || r.status === "default"
      ? live.states.get(r.borrower.toLowerCase())
      : undefined;
  const rateOf = (r: LoanRecord) => {
    const l = stateOf(r)?.loan;
    return l ? rateIn(l, Math.max(currentPeriod, l.disbursedPeriod + 1)) : null;
  };

  const filtered = sortLoans(filterLoans(records, status, type, debounced, name), sort, rateOf);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const times = useBlockTimes(shown);

  const refresh = () => {
    void q.refetch();
    void live.refetch();
    onChanged();
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
      active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex flex-wrap gap-1 rounded-full bg-secondary p-1"
            role="group"
            aria-label={t("loans.list.statusAria")}
          >
            {LOAN_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={status === f.value}
                onClick={() => setParam("status", f.value, "all")}
                className={chip(status === f.value)}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex gap-1 rounded-full bg-secondary p-1"
            role="group"
            aria-label={t("loans.list.typeAria")}
          >
            {LOAN_TYPES.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={type === f.value}
                onClick={() => setParam("type", f.value, "all")}
                className={chip(type === f.value)}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {t("loans.list.sort")}
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value, "newest")}
              className="h-10 rounded-full border border-border bg-card px-3.5 text-[13.5px] text-foreground outline-none focus:border-foreground/40"
            >
              {LOAN_SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="relative ml-auto min-w-[220px] flex-1 sm:max-w-[280px]">
            <span className="sr-only">{t("loans.list.searchLabel")}</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("loans.list.searchPlaceholder")}
              className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-[14px] outline-none transition-colors placeholder:text-faint focus:border-foreground/40"
            />
          </label>
        </div>
      </div>

      {q.data?.partial && <InlineAlert tone="info">{t("loans.list.partial")}</InlineAlert>}

      {q.isPending ? (
        <StateView
          state="loading"
          label={t("loans.list.loading")}
          skeleton={
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-[12px]" />
              ))}
            </div>
          }
        />
      ) : q.isError ? (
        <StateView state="error" onRetry={() => q.refetch()} />
      ) : filtered.length === 0 ? (
        <StateView
          state="empty"
          illustration={<EmptyArt variant="loans" />}
          message={records.length === 0 ? t("loans.list.empty") : t("loans.list.noMatch")}
        />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="relative overflow-x-auto">
            <table
              aria-label={t("loans.list.tableAria")}
              className="w-full min-w-[720px] text-[14px]"
            >
              <thead>
                <tr className="border-b border-line-soft text-left text-[12.5px] text-muted-foreground">
                  <th className="px-6 py-3.5 font-medium">{t("loans.borrower")}</th>
                  <th className="px-6 py-3.5 text-right font-medium">
                    {t("loans.list.amount", { symbol: asset.symbol })}
                  </th>
                  <th className="px-6 py-3.5 font-medium">{t("loans.list.status")}</th>
                  <th className="px-6 py-3.5 text-right font-medium">{t("loans.list.rateNow")}</th>
                  <th className="px-6 py-3.5 font-medium">{t("loans.list.asked")}</th>
                  <th className="px-6 py-3.5 font-medium">
                    <span className="sr-only">{t("loans.list.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const st = stateOf(r);
                  const rate = rateOf(r);
                  const at = times.get(String(r.block));
                  const isMe = me?.toLowerCase() === r.borrower.toLowerCase();
                  const isG = me?.toLowerCase() === r.guarantor.toLowerCase();
                  const canMark =
                    !isMe &&
                    r.status === "active" &&
                    st?.loan != null &&
                    isDefaultable(st.loan, st.overdueMonths, rules.defaultAfter, currentPeriod);
                  const settleOpen = openRequests.some(
                    (o) =>
                      o.kind === "settle" && o.borrower.toLowerCase() === r.borrower.toLowerCase(),
                  );
                  const canSettle =
                    r.status === "default" && (dissolved || (!isMe && !isG && !settleOpen));
                  return (
                    <tr
                      key={r.requestId}
                      className="border-b border-line-soft last:border-0"
                      data-testid="loan-row"
                      data-status={r.status}
                    >
                      <td className="px-6 py-[18px]">
                        <span className="inline-flex items-center gap-3 align-middle">
                          <Avatar address={r.borrower} size={30} />
                          <span className="grid gap-0.5">
                            <span className="font-medium">
                              {name(r.borrower)}
                              {isMe && (
                                <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] text-brand">
                                  {t("loans.list.you")}
                                </span>
                              )}
                            </span>
                            <span className="text-[12px] text-muted-foreground">
                              {r.guarantor !== ZERO
                                ? t("loans.list.backedBy", {
                                    type: r.medical ? t("loans.medical") : t("loans.regular"),
                                    name: name(r.guarantor),
                                  })
                                : r.medical
                                  ? t("loans.medical")
                                  : t("loans.regular")}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-6 py-[18px] text-right tabular">
                        {avax(r.amount, asset)}
                        {(r.status === "active" || r.status === "default") &&
                          r.outstanding !== r.amount && (
                            <span className="block text-[12px] text-muted-foreground">
                              {t("loans.list.left", { amount: avax(r.outstanding, asset) })}
                            </span>
                          )}
                      </td>
                      <td className="px-6 py-[18px]">
                        <StatusPill status={r.status} />
                        {st && st.overdueMonths > 0 && (
                          <span className="mt-1 block text-[12px] text-muted-foreground">
                            {tn("loans.list.interestLate", st.overdueMonths)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-[18px] text-right font-mono text-[13.5px] tabular">
                        {rate === null ? "–" : formatBps(rate)}
                      </td>
                      <td className="px-6 py-[18px] text-[13px] text-muted-foreground">
                        {at ? formatWhen(at) : " "}
                      </td>
                      <td className="px-6 py-[18px] text-right">
                        {canMark ? (
                          <MarkDefaultButton
                            circle={circle}
                            borrower={r.borrower as Address}
                            name={name(r.borrower)}
                            hasGuarantor={r.guarantor !== ZERO}
                            onDone={refresh}
                          />
                        ) : canSettle ? (
                          <ProposeSettleButton
                            circle={circle}
                            borrower={r.borrower as Address}
                            name={name(r.borrower)}
                            onDone={refresh}
                            now={dissolved}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={current}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            noun={t("loans.list.noun")}
          />
        </div>
      )}
    </div>
  );
}

function MarkDefaultButton({
  circle,
  borrower,
  name,
  hasGuarantor,
  onDone,
}: {
  circle: Address;
  borrower: Address;
  name: string;
  hasGuarantor: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const action = useLoanTx(circle);
  const { t } = useT();
  async function mark() {
    const ok = await action.markDefault(borrower);
    if (ok) {
      setOpen(false);
      action.tx.reset();
      notify.success(t("loans.list.markedToast", { name }));
      onDone();
    }
  }
  return (
    <>
      <Button variant="secondary" size="sm" icon={Gavel} onClick={() => setOpen(true)}>
        {t("loans.list.mark")}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !action.working && setOpen(v)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("loans.list.markTitle", { name })}</DialogTitle>
            <DialogDescription>{t("loans.list.markDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 pt-1 text-[13.5px] leading-relaxed text-muted-foreground">
            <p>
              {t(hasGuarantor ? "loans.list.markBodyGuarantor" : "loans.list.markBody", { name })}
            </p>
            <div className="grid gap-4">
              <Button
                variant="danger"
                icon={Gavel}
                workingLabel={t("loans.list.marking")}
                state={action.working ? "working" : undefined}
                onClick={mark}
              >
                {t("loans.list.markYes")}
              </Button>
              <TxFor tx={action.tx} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProposeSettleButton({
  circle,
  borrower,
  name,
  now,
  onDone,
}: {
  circle: Address;
  borrower: Address;
  name: string;
  /** The circle is dissolved: this settles straight away instead of starting a vote. */
  now: boolean;
  onDone: () => void;
}) {
  const action = useLoanTx(circle);
  const { t } = useT();
  return (
    <div className="grid justify-items-end gap-2">
      <Button
        variant="secondary"
        size="sm"
        icon={Scale}
        workingLabel={t("loans.sending")}
        state={action.working ? "working" : undefined}
        onClick={async () => {
          const ok = await action.proposeSettle(borrower);
          if (ok) {
            notify.success(
              now
                ? t("loans.list.settledNowToast", { name })
                : t("loans.list.settleStartedToast", { name }),
            );
            onDone();
          }
        }}
      >
        {now ? t("loans.list.settleNow") : t("loans.list.askSettle")}
      </Button>
      <TxFor tx={action.tx} />
    </div>
  );
}
