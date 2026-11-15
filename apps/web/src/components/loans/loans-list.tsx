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
  onChanged,
}: {
  circle: Address;
  me: Address | undefined;
  rules: RulesParams;
  currentPeriod: number;
  openRequests: readonly LoanRequestView[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const page = usePageParam();
  const q = useCircleEvents(circle);

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
            aria-label="Status"
          >
            {LOAN_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={status === f.value}
                onClick={() => setParam("status", f.value, "all")}
                className={chip(status === f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-full bg-secondary p-1" role="group" aria-label="Type">
            {LOAN_TYPES.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={type === f.value}
                onClick={() => setParam("type", f.value, "all")}
                className={chip(type === f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value, "newest")}
              className="h-10 rounded-full border border-border bg-card px-3.5 text-[13.5px] text-foreground outline-none focus:border-foreground/40"
            >
              {LOAN_SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="relative ml-auto min-w-[220px] flex-1 sm:max-w-[280px]">
            <span className="sr-only">Search by borrower name or address</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search borrower name or address"
              className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-[14px] outline-none transition-colors placeholder:text-faint focus:border-foreground/40"
            />
          </label>
        </div>
      </div>

      {q.data?.partial && (
        <InlineAlert tone="info">
          This circle is older than the history we can read quickly, so only recent loans are
          listed. Full history arrives with the activity indexer.
        </InlineAlert>
      )}

      {q.isPending ? (
        <StateView
          state="loading"
          label="Reading the circle's loans"
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
          message={
            records.length === 0
              ? "Nobody has asked for a loan yet. When someone does, it shows up here with its vote and repayments."
              : "No loans match. Try another name, or show all loans."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="overflow-x-auto">
            <table aria-label="Loans" className="w-full min-w-[720px] text-[14px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-[12.5px] text-muted-foreground">
                  <th className="px-6 py-3.5 font-medium">Borrower</th>
                  <th className="px-6 py-3.5 text-right font-medium">Amount (AVAX)</th>
                  <th className="px-6 py-3.5 font-medium">Status</th>
                  <th className="px-6 py-3.5 text-right font-medium">Rate now</th>
                  <th className="px-6 py-3.5 font-medium">Asked</th>
                  <th className="px-6 py-3.5 font-medium">
                    <span className="sr-only">Actions</span>
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
                  const canSettle = r.status === "default" && !isMe && !isG && !settleOpen;
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
                                  You
                                </span>
                              )}
                            </span>
                            <span className="text-[12px] text-muted-foreground">
                              {r.medical ? "Medical" : "Regular"}
                              {r.guarantor !== ZERO ? ` · backed by ${name(r.guarantor)}` : ""}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-6 py-[18px] text-right tabular">
                        {avax(r.amount)}
                        {(r.status === "active" || r.status === "default") &&
                          r.outstanding !== r.amount && (
                            <span className="block text-[12px] text-muted-foreground">
                              {avax(r.outstanding)} left
                            </span>
                          )}
                      </td>
                      <td className="px-6 py-[18px]">
                        <StatusPill status={r.status} />
                        {st && st.overdueMonths > 0 && (
                          <span className="mt-1 block text-[12px] text-muted-foreground">
                            Interest {st.overdueMonths}{" "}
                            {st.overdueMonths === 1 ? "month" : "months"} late
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
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={current} pageSize={PAGE_SIZE} total={filtered.length} noun="loans" />
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
  async function mark() {
    const ok = await action.markDefault(borrower);
    if (ok) {
      setOpen(false);
      action.tx.reset();
      notify.success(`${name}'s loan is marked as defaulted.`);
      onDone();
    }
  }
  return (
    <>
      <Button variant="secondary" size="sm" icon={Gavel} onClick={() => setOpen(true)}>
        Mark as defaulted
      </Button>
      <Dialog open={open} onOpenChange={(v) => !action.working && setOpen(v)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Mark {name}&apos;s loan as defaulted?</DialogTitle>
            <DialogDescription>
              Their interest is late long enough, or all three loan terms are over, so the rules
              allow it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 pt-1 text-[13.5px] leading-relaxed text-muted-foreground">
            <p>
              {name}
              {hasGuarantor ? " and their guarantor" : ""} will be frozen: no leaving and no new
              loans. Nothing is taken yet. Paying what&apos;s owed lifts the freeze; if it stays
              unpaid, the circle can vote to repay it from their savings.
            </p>
            <div className="grid gap-4">
              <Button
                variant="danger"
                icon={Gavel}
                workingLabel="Marking…"
                state={action.working ? "working" : undefined}
                onClick={mark}
              >
                Yes, mark as defaulted
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
  onDone,
}: {
  circle: Address;
  borrower: Address;
  name: string;
  onDone: () => void;
}) {
  const action = useLoanTx(circle);
  return (
    <div className="grid justify-items-end gap-2">
      <Button
        variant="secondary"
        size="sm"
        icon={Scale}
        workingLabel="Sending…"
        state={action.working ? "working" : undefined}
        onClick={async () => {
          const ok = await action.proposeSettle(borrower);
          if (ok) {
            notify.success(`Settle vote started for ${name}'s loan. Your yes is counted.`);
            onDone();
          }
        }}
      >
        Ask the circle to settle
      </Button>
      <TxFor tx={action.tx} />
    </div>
  );
}
