"use client";

import { explorerAddressUrl, formatAvax, periodLabel, shortAddress } from "@wealthkart/sdk";
import { HandCoins } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CountdownUTC } from "@/components/app/countdown-utc";
import { Avatar, CircleCover } from "@/components/art";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, usePageParam } from "@/components/app/pagination";
import { StatCard } from "@/components/app/stat-card";
import { CircleNotFound } from "@/components/app/circle-not-found";
import { Button, ErrorBoundary, InlineAlert, StateView } from "@/components/kit";
import { InviteCard } from "@/components/membership/invite-card";
import { NameCard } from "@/components/membership/name-card";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import {
  MEMBERS_PAGE_SIZE,
  parseCircleId,
  useChainNow,
  useCircle,
  useCircleMembers,
} from "@/lib/circle";
import type { Address } from "viem";

export default function CirclePage() {
  return (
    <RequireWallet>
      <Suspense fallback={null}>
        <CircleOverview />
      </Suspense>
    </RequireWallet>
  );
}

function CircleOverview() {
  const router = useRouter();
  const id = parseCircleId(useSearchParams().get("id"));
  const { chainId, address } = useCoreWallet();
  const c = useCircle(id);
  const chainNow = useChainNow();

  if (!id || c.notFound) return <CircleNotFound notACircle={c.notACircle} />;

  if (c.isPending || !c.data) {
    return (
      <StateView
        state="loading"
        label="Loading circle"
        skeleton={
          <div className="grid gap-8">
            <Skeleton className="h-12 w-72 rounded-lg" />
            <div className="grid gap-5 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40 rounded-[14px]" />
              ))}
            </div>
          </div>
        }
      />
    );
  }

  if (c.isError) return <StateView state="error" onRetry={() => c.refetch()} />;

  const d = c.data;
  const explorer = chainId ? explorerAddressUrl(chainId, id) : null;

  return (
    <>
      <div className="mb-10 h-[120px] overflow-hidden rounded-[14px] border border-line-soft sm:h-[150px]">
        <CircleCover address={id} name={d.name} />
      </div>
      <PageHeader
        title={d.name}
        subtitle={
          <>
            {String(d.memberCount)} members · {formatAvax(d.installment)} AVAX a month · due on day{" "}
            {d.dueDay}
            {explorer && (
              <>
                {" · "}
                <a
                  href={explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-4 hover:underline"
                >
                  View contract
                </a>
              </>
            )}
          </>
        }
        actions={
          d.isMember && d.due?.payable ? (
            <Button icon={HandCoins} onClick={() => router.push(`/app/circle/pay/?id=${id}`)}>
              Pay {formatAvax(d.due.amount)} AVAX
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard
          label="Circle value"
          value={formatAvax(d.totalAssets)}
          unit="AVAX"
          meta="Everything members have put in, plus fees"
        />
        <StatCard
          label="My stake"
          value={d.isMember ? formatAvax(d.stake) : "–"}
          unit={d.isMember ? "AVAX" : undefined}
          meta={
            d.isMember ? "Your share of the circle right now" : "You're not a member of this circle"
          }
        />
        {d.isMember && d.due ? (
          d.due.payable ? (
            <StatCard
              label={`You owe for ${periodLabel(d.due.period)}`}
              value={formatAvax(d.due.amount)}
              unit="AVAX"
              tone="due"
            >
              <CountdownUTC period={Number(d.due.period)} dueDay={d.dueDay} />
              {d.due.fees > 0n && (
                <span className="text-[12.5px] text-warn">
                  Includes {formatAvax(d.due.fees)} AVAX in late fees
                </span>
              )}
            </StatCard>
          ) : (
            <StatCard
              label="This month"
              value="Paid"
              meta={`Next due: ${periodLabel(d.due.period)}`}
            />
          )
        ) : (
          <StatCard
            label="Late fees"
            value={formatAvax(d.fee1)}
            unit="AVAX"
            meta={`After day ${d.dueDay}, plus ${formatAvax(d.fee2)} after day ${d.secondFeeDay}`}
          />
        )}
      </div>

      {d.isMember && address && (
        <section className="mt-16 grid gap-5 lg:grid-cols-2">
          <ErrorBoundary preset="widget" name="Your name">
            <NameCard
              circle={id}
              me={address}
              name={d.myName}
              nameChangedAt={d.myNameChangedAt}
              chainNow={chainNow}
              onSaved={() => void c.refetch()}
            />
          </ErrorBoundary>
          <ErrorBoundary preset="widget" name="Invite">
            <InviteCard circle={id} me={address} />
          </ErrorBoundary>
        </section>
      )}

      {d.isMember && d.openRequestCount > 0 && (
        <div className="mt-10">
          <InlineAlert tone="info">
            {d.openRequestCount === 1
              ? "1 person is asking to join. "
              : `${d.openRequestCount} people are asking to join. `}
            <Link
              href={`/app/circle/votes/?id=${id}`}
              className="font-semibold underline underline-offset-4"
            >
              Go to Votes
            </Link>
          </InlineAlert>
        </div>
      )}

      <section className="mt-16">
        <h2 className="mb-6 text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          Members
        </h2>
        <ErrorBoundary preset="widget" name="Members">
          <MembersTable id={id} total={Number(d.memberListLength)} currentPeriod={d.due?.period} />
        </ErrorBoundary>
      </section>
    </>
  );
}

function MembersTable({
  id,
  total,
  currentPeriod,
}: {
  id: Address;
  total: number;
  currentPeriod?: bigint;
}) {
  const page = usePageParam();
  const m = useCircleMembers(id, page);
  const { address } = useCoreWallet();

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card">
      {m.isPending ? (
        <div className="grid gap-3 p-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : m.isError ? (
        <div className="p-6">
          <StateView state="error" onRetry={() => m.refetch()} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[12.5px] text-muted-foreground">
                <th className="px-6 py-3.5 font-medium">Member</th>
                <th className="px-6 py-3.5 text-right font-medium">Stake (AVAX)</th>
                <th className="px-6 py-3.5 font-medium">Paid up to</th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => {
                const behind =
                  currentPeriod !== undefined &&
                  r.nextPeriod !== null &&
                  r.nextPeriod < currentPeriod;
                return (
                  <tr key={r.address} className="border-b border-line-soft last:border-0">
                    <td className="px-6 py-[18px]">
                      <span className="inline-flex items-center gap-3 align-middle">
                        <Avatar address={r.address} size={30} />
                        <span className="grid gap-0.5">
                          <span className="font-medium">{r.name || "No name yet"}</span>
                          <span className="font-mono text-[12px] text-muted-foreground">
                            {shortAddress(r.address)}
                          </span>
                        </span>
                      </span>
                      {address?.toLowerCase() === r.address.toLowerCase() && (
                        <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] text-brand">
                          You
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-[18px] text-right tabular">{formatAvax(r.stake)}</td>
                    <td className="px-6 py-[18px]">
                      {!r.active ? (
                        <span className="text-[12.5px] text-muted-foreground">Left</span>
                      ) : r.nextPeriod === null ? (
                        "–"
                      ) : r.shares === 0n ? (
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[12.5px]">
                          Nothing paid yet
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] ${behind ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}
                        >
                          <span className="size-1.5 rounded-full bg-current" aria-hidden />
                          {r.nextPeriod === 0n ? "Not started" : periodLabel(r.nextPeriod - 1n)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={MEMBERS_PAGE_SIZE} total={total} noun="members" />
    </div>
  );
}
