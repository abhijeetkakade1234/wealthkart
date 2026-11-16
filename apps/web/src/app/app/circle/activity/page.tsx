"use client";

import { circleVaultAbi, explorerTxUrl, shortAddress } from "@wealthkart/sdk";
import { ExternalLink, HandCoins, Landmark, Search, UserRound, Vote } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";

import { CircleNotFound } from "@/components/app/circle-not-found";
import { PageHeader } from "@/components/app/page-header";
import { CirclePauseBanner } from "@/components/exits/pause";
import { Pagination, usePageParam } from "@/components/app/pagination";
import { EmptyArt } from "@/components/art";
import { ErrorBoundary, InlineAlert, StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { parseCircleId, useCircle } from "@/lib/circle";
import { useCircleEvents } from "@/lib/events";
import { FEED_FILTERS, type FeedKind, filterFeed, toFeed } from "@/lib/feed";
import { formatWhen, useBlockTimes } from "@/lib/use-block-times";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const KIND_ICON = { payment: HandCoins, member: UserRound, vote: Vote, loan: Landmark } as const;

export default function ActivityPage() {
  return (
    <RequireWallet>
      <Suspense fallback={null}>
        <Activity />
      </Suspense>
    </RequireWallet>
  );
}

function Activity() {
  const id = parseCircleId(useSearchParams().get("id"));
  const c = useCircle(id);

  if (!id || c.notFound) return <CircleNotFound notACircle={c.notACircle} />;
  if (c.isPending || !c.data) {
    return (
      <StateView
        state="loading"
        label="Loading activity"
        skeleton={<Skeleton className="h-96 max-w-[760px] rounded-[14px]" />}
      />
    );
  }
  if (c.isError) return <StateView state="error" onRetry={() => c.refetch()} />;
  if (!c.data.isMember) return <StateView state="access" reason="not-member" />;

  return (
    <div className="max-w-[760px]">
      <PageHeader
        title="Activity"
        subtitle={`${c.data.name} · every payment, loan, member change and vote, straight from the blockchain.`}
      />
      <CirclePauseBanner circle={id} />
      <ErrorBoundary preset="widget" name="Activity">
        <Feed id={id} />
      </ErrorBoundary>
    </div>
  );
}

function Feed({ id }: { id: Address }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const page = usePageParam();
  const { chainId } = useCoreWallet();
  const q = useCircleEvents(id);

  const rawType = params.get("type");
  const kind: FeedKind | "all" = FEED_FILTERS.some((f) => f.value === rawType)
    ? (rawType as FeedKind)
    : "all";
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebounced(search, 300);

  // Keep the URL in step with the search box (shareable state, ADR 0023).
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (debounced === current) return;
    const next = new URLSearchParams(params.toString());
    if (debounced) next.set("q", debounced);
    else next.delete("q");
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [debounced, params, pathname, router]);

  function setKind(value: FeedKind | "all") {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("type");
    else next.set("type", value);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const feed = useMemo(() => (q.data ? toFeed(q.data.logs) : []), [q.data]);
  const people = useMemo(
    () => [...new Set(feed.flatMap((f) => f.people.map((p) => p.toLowerCase())))],
    [feed],
  );
  const names = useReadContracts({
    allowFailure: true,
    contracts: people.map(
      (p) =>
        ({
          abi: circleVaultAbi,
          address: id,
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

  const filtered = filterFeed(feed, kind, debounced, name);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const times = useBlockTimes(shown);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full bg-secondary p-1" role="group" aria-label="Show">
          {FEED_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={kind === f.value}
              onClick={() => setKind(f.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
                kind === f.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative ml-auto min-w-[220px] flex-1 sm:max-w-[280px]">
          <span className="sr-only">Search by name, address or transaction</span>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            strokeWidth={1.75}
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, address or tx"
            className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-[14px] outline-none transition-colors placeholder:text-faint focus:border-foreground/40"
          />
        </label>
      </div>

      {q.data?.partial && (
        <InlineAlert tone="info">
          This circle is older than the history we can read quickly, so only recent activity is
          shown. Full history arrives with the activity indexer.
        </InlineAlert>
      )}

      {q.isPending ? (
        <StateView
          state="loading"
          label="Reading the circle's history"
          skeleton={
            <div className="grid gap-3">
              {[0, 1, 2, 3].map((i) => (
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
          illustration={<EmptyArt variant="activity" />}
          message={
            feed.length === 0
              ? "Nothing has happened in this circle yet. Payments, new members and votes will show up here."
              : "Nothing matches. Try another name, or show everything."
          }
        />
      ) : (
        <>
          <ol className="grid divide-y divide-line-soft rounded-[14px] border border-border bg-card">
            {shown.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const url = chainId ? explorerTxUrl(chainId, item.tx) : null;
              const at = times.get(String(item.block));
              return (
                <li
                  key={item.id}
                  className="flex items-start gap-4 px-6 py-5"
                  data-testid="activity-item"
                  data-kind={item.kind}
                >
                  <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <Icon className="size-4" strokeWidth={1.5} aria-hidden />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p className="text-[14.5px] leading-snug">{item.text(name)}</p>
                    <p className="text-[12.5px] text-muted-foreground">
                      {at ? formatWhen(at) : " "}
                    </p>
                  </div>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      aria-label="View this transaction on Snowtrace"
                    >
                      Snowtrace
                      <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden />
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="rounded-[14px] border border-border bg-card">
            <Pagination
              page={current}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              noun="entries"
            />
          </div>
        </>
      )}
    </div>
  );
}
