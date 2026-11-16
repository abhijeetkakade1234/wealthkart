"use client";

import { explorerAddressUrl, shortAddress } from "@wealthkart/sdk";
import { HandCoins } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { periodOf } from "@wealthkart/rules";

import { CircleAnalytics } from "@/components/analytics/circle-analytics";
import { AssetBadge } from "@/components/app/asset-pay";
import { CountdownUTC } from "@/components/app/countdown-utc";
import { Avatar, CircleCover } from "@/components/art";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, usePageParam } from "@/components/app/pagination";
import { StatCard } from "@/components/app/stat-card";
import { CircleNotFound } from "@/components/app/circle-not-found";
import { Button, ErrorBoundary, InlineAlert, StateView } from "@/components/kit";
import { LeaveCard } from "@/components/exits/leave-card";
import { GuardianPause, PauseBanner } from "@/components/exits/pause";
import { WithdrawAlert } from "@/components/exits/withdraw-alert";
import { DissolvedNotice, RuleChangeBanner } from "@/components/governance/circle-notices";
import { RulesCard } from "@/components/governance/rules-card";
import {
  BackupForCards,
  BackupWalletCard,
  NomineeClaimAlert,
} from "@/components/membership/backup-wallet";
import { DormantNotice, ProposeDormantButton } from "@/components/membership/dormant";
import { InviteCard } from "@/components/membership/invite-card";
import { NameCard } from "@/components/membership/name-card";
import { CircleRemindersCard } from "@/components/reminders/circle-reminders-card";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { useT } from "@/i18n/react";
import {
  MEMBERS_PAGE_SIZE,
  monthLabel,
  parseCircleId,
  useChainNow,
  useCircle,
  useCircleMembers,
} from "@/lib/circle";
import { type CircleAsset, fmt } from "@/lib/asset";
import { useCircleGov } from "@/lib/gov-hooks";
import { votingRightsNote } from "@/lib/membership";
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
  const g = useCircleGov(id);
  const chainNow = useChainNow();
  const { t, tn } = useT();

  if (!id || c.notFound) return <CircleNotFound notACircle={c.notACircle} />;

  if (c.isPending || !c.data) {
    return (
      <StateView
        state="loading"
        label={t("circle.loading")}
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
  const asset = d.asset;
  const gov = g.data;
  const explorer = chainId ? explorerAddressUrl(chainId, id) : null;
  const refetchAll = () => {
    void c.refetch();
    void g.refetch();
  };

  return (
    <>
      <div className="mb-10 h-[120px] overflow-hidden rounded-[14px] border border-line-soft sm:h-[150px]">
        <CircleCover address={id} name={d.name} />
      </div>
      <PageHeader
        title={d.name}
        subtitle={
          <>
            {t("circle.subtitle", {
              count: String(d.memberCount),
              amount: fmt(d.installment, asset),
              symbol: asset.symbol,
              day: d.dueDay,
            })}
            {explorer && (
              <>
                {" · "}
                <a
                  href={explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-4 hover:underline"
                >
                  {t("circle.viewContract")}
                </a>
              </>
            )}
            <AssetBadge asset={asset} className="ml-2.5 align-[2px]" />
          </>
        }
        actions={
          d.isMember && d.due?.payable ? (
            <Button icon={HandCoins} onClick={() => router.push(`/app/circle/pay/?id=${id}`)}>
              {t("circle.payAmount", { amount: fmt(d.due.amount, asset), symbol: asset.symbol })}
            </Button>
          ) : undefined
        }
      />

      {gov && (
        <div className="mb-10 grid gap-5 empty:hidden">
          <ErrorBoundary preset="widget" name={t("circle.widget.notices")}>
            <PauseBanner circle={id} gov={gov} chainNow={chainNow} onChanged={refetchAll} />
            <DissolvedNotice
              circle={id}
              gov={gov}
              isMember={d.isMember}
              share={d.stake}
              onChanged={refetchAll}
            />
            <RuleChangeBanner circle={id} gov={gov} chainNow={chainNow} onChanged={refetchAll} />
            <WithdrawAlert circle={id} amount={gov.withdrawable} onChanged={refetchAll} />
          </ErrorBoundary>
        </div>
      )}

      {d.isMember && (
        <div className="mb-10 grid gap-5 empty:hidden">
          <ErrorBoundary preset="widget" name={t("circle.widget.backupClaim")}>
            <NomineeClaimAlert circle={id} chainNow={chainNow} onChanged={refetchAll} />
          </ErrorBoundary>
        </div>
      )}

      {d.iAmDormant && (
        <div className="mb-10">
          <ErrorBoundary preset="widget" name={t("circle.widget.dormant")}>
            <DormantNotice circle={id} onWoke={() => void c.refetch()} />
          </ErrorBoundary>
        </div>
      )}

      <div className="mb-10 grid gap-5 empty:hidden">
        <ErrorBoundary preset="widget" name={t("circle.widget.backupFor")}>
          <BackupForCards
            circle={id}
            asset={asset}
            exitNoticeDays={gov?.rules?.exitNoticeDays ?? 30}
            dormantAfter={d.dormantAfter}
            chainNow={chainNow}
          />
        </ErrorBoundary>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard
          label={t("circle.stat.value")}
          value={fmt(d.totalAssets, asset)}
          unit={asset.symbol}
          meta={t("circle.stat.valueMeta")}
        />
        <StatCard
          label={t("circle.stat.stake")}
          value={d.isMember ? fmt(d.stake, asset) : "–"}
          unit={d.isMember ? asset.symbol : undefined}
          meta={d.isMember ? t("circle.stat.stakeMeta") : t("circle.stat.notMember")}
        />
        {d.isMember && d.due ? (
          d.due.payable ? (
            <StatCard
              label={t("circle.stat.owe", { month: monthLabel(d.due.period) })}
              value={fmt(d.due.amount, asset)}
              unit={asset.symbol}
              tone="due"
            >
              <CountdownUTC period={Number(d.due.period)} dueDay={d.dueDay} />
              {d.due.fees > 0n && (
                <span className="text-[12.5px] text-warn">
                  {t("circle.stat.includesFees", {
                    amount: fmt(d.due.fees, asset),
                    symbol: asset.symbol,
                  })}
                </span>
              )}
            </StatCard>
          ) : (
            <StatCard
              label={t("circle.stat.thisMonth")}
              value={t("circle.stat.paid")}
              meta={t("circle.stat.nextDue", { month: monthLabel(d.due.period) })}
            />
          )
        ) : (
          <StatCard
            label={t("circle.stat.lateFees")}
            value={fmt(d.fee1, asset)}
            unit={asset.symbol}
            meta={t("circle.stat.lateFeesMeta", {
              day: d.dueDay,
              fee2: fmt(d.fee2, asset),
              day2: d.secondFeeDay,
            })}
          />
        )}
      </div>

      {d.isMember && address && (
        <section className="mt-16 grid gap-5 lg:grid-cols-2">
          <ErrorBoundary preset="widget" name={t("circle.widget.name")}>
            <NameCard
              circle={id}
              me={address}
              name={d.myName}
              nameChangedAt={d.myNameChangedAt}
              chainNow={chainNow}
              onSaved={() => void c.refetch()}
            />
          </ErrorBoundary>
          <ErrorBoundary preset="widget" name={t("circle.widget.invite")}>
            <InviteCard circle={id} me={address} />
          </ErrorBoundary>
          <div id="reminders" className="scroll-mt-24">
            <ErrorBoundary preset="widget" name={t("circle.widget.reminders")}>
              <CircleRemindersCard circle={id} />
            </ErrorBoundary>
          </div>
          <ErrorBoundary preset="widget" name={t("circle.widget.backup")}>
            <BackupWalletCard
              circle={id}
              me={address}
              exitNoticeDays={gov?.rules?.exitNoticeDays ?? 30}
              onChanged={refetchAll}
            />
          </ErrorBoundary>
        </section>
      )}

      {gov?.rules && (
        <section className="mt-16 grid gap-5 lg:grid-cols-2">
          <ErrorBoundary preset="widget" name={t("circle.widget.rules")}>
            <RulesCard circle={id} rules={gov.rules} />
          </ErrorBoundary>
          {d.isMember && !gov.dissolved && !gov.claimQueued && (
            <ErrorBoundary preset="widget" name={t("circle.widget.leaving")}>
              <LeaveCard circle={id} gov={gov} chainNow={chainNow} onChanged={refetchAll} />
            </ErrorBoundary>
          )}
          {d.isMember && (
            <ErrorBoundary preset="widget" name={t("circle.widget.guardian")}>
              <GuardianPause circle={id} gov={gov} chainNow={chainNow} onChanged={refetchAll} />
            </ErrorBoundary>
          )}
        </section>
      )}

      {d.isMember && d.openRequestCount > 0 && (
        <div className="mt-10">
          <InlineAlert tone="info">
            {tn("circle.openVotes", d.openRequestCount)}{" "}
            <Link
              href={`/app/circle/votes/?id=${id}`}
              className="font-semibold underline underline-offset-4"
            >
              {t("circle.goToVotes")}
            </Link>
          </InlineAlert>
        </div>
      )}

      <section className="mt-16">
        <h2 className="mb-6 text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          {t("circle.howDoing")}
        </h2>
        <ErrorBoundary preset="widget" name={t("circle.widget.history")}>
          <CircleAnalytics
            id={id}
            memberListLength={Number(d.memberListLength)}
            currentPeriod={periodOf(chainNow)}
            chainNow={chainNow}
            dueDay={d.dueDay}
            money={
              gov?.rules
                ? {
                    totalAssets: d.totalAssets,
                    loansOutstanding: gov.loansOutstanding,
                    reserveBps: gov.rules.reserveBps,
                  }
                : undefined
            }
            mine={
              d.isMember && address
                ? {
                    me: address,
                    stake: d.stake,
                    totalAssets: d.totalAssets,
                    installment: d.installment,
                    circleName: d.name,
                  }
                : undefined
            }
          />
        </ErrorBoundary>
      </section>

      <section className="mt-16">
        <h2 className="mb-6 text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          {t("circle.membersHeading")}
        </h2>
        <ErrorBoundary preset="widget" name={t("circle.widget.members")}>
          <MembersTable
            asset={asset}
            id={id}
            total={Number(d.memberListLength)}
            canPropose={d.isMember && !d.iAmDormant}
            dormantAfter={d.dormantAfter}
            minPaidToVote={d.minPaidToVote}
            onChanged={() => void c.refetch()}
          />
        </ErrorBoundary>
      </section>
    </>
  );
}

function MembersTable({
  asset,
  id,
  total,
  canPropose,
  dormantAfter,
  minPaidToVote,
  onChanged,
}: {
  asset: CircleAsset;
  id: Address;
  total: number;
  /** The viewer is an active member, so they may start a dormant vote. */
  canPropose: boolean;
  dormantAfter: number;
  minPaidToVote: number;
  onChanged: () => void;
}) {
  const page = usePageParam();
  const m = useCircleMembers(id, page);
  const { address } = useCoreWallet();
  const { t, tn } = useT();

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
          <table aria-label={t("circle.table.label")} className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[12.5px] text-muted-foreground">
                <th className="px-6 py-3.5 font-medium">{t("circle.table.member")}</th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {t("circle.table.stake", { symbol: asset.symbol })}
                </th>
                <th className="px-6 py-3.5 font-medium">{t("circle.table.paidUpTo")}</th>
                <th className="px-6 py-3.5 font-medium">
                  <span className="sr-only">{t("circle.table.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => {
                const behind = r.overdue > 0;
                const isMe = address?.toLowerCase() === r.address.toLowerCase();
                const proposable =
                  canPropose &&
                  !isMe &&
                  r.active &&
                  !r.dormant &&
                  r.overdue >= dormantAfter &&
                  r.openDormantId === 0n;
                return (
                  <tr key={r.address} className="border-b border-line-soft last:border-0">
                    <td className="px-6 py-[18px]">
                      <span className="inline-flex items-center gap-3 align-middle">
                        <Avatar address={r.address} size={30} />
                        <span className="grid gap-0.5">
                          <span className="font-medium">{r.name || t("circle.table.noName")}</span>
                          <span className="font-mono text-[12px] text-muted-foreground">
                            {shortAddress(r.address)}
                          </span>
                        </span>
                      </span>
                      {isMe && (
                        <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] text-brand">
                          {t("circle.table.you")}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-[18px] text-right tabular">{fmt(r.stake, asset)}</td>
                    <td className="px-6 py-[18px]">
                      {!r.active ? (
                        <span className="text-[12.5px] text-muted-foreground">
                          {t("circle.table.left")}
                        </span>
                      ) : r.dormant ? (
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[12.5px]">
                          {t("circle.table.dormant")}
                        </span>
                      ) : r.nextPeriod === null ? (
                        "–"
                      ) : r.shares === 0n ? (
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[12.5px]">
                          {t("circle.table.nothingPaid")}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] ${behind ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}
                        >
                          <span className="size-1.5 rounded-full bg-current" aria-hidden />
                          {r.nextPeriod === 0n
                            ? t("circle.table.notStarted")
                            : monthLabel(r.nextPeriod - 1n)}
                        </span>
                      )}
                      {r.active && !r.dormant && !r.voter && (
                        <span className="mt-1 block text-[12px] text-muted-foreground">
                          {votingRightsNote(r.paid, minPaidToVote)}
                        </span>
                      )}
                      {behind && !r.dormant && (
                        <span className="mt-1 block text-[12px] text-muted-foreground">
                          {tn("circle.table.missed", r.overdue)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-[18px] text-right">
                      {proposable ? (
                        <ProposeDormantButton
                          circle={id}
                          member={r.address}
                          name={r.name || shortAddress(r.address)}
                          onProposed={() => {
                            m.refetch();
                            onChanged();
                          }}
                        />
                      ) : r.openDormantId > 0n ? (
                        <Link
                          href={`/app/circle/votes/?id=${id}`}
                          className="text-[13px] font-medium text-brand underline-offset-4 hover:underline"
                        >
                          {t("circle.table.voteOpen")}
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        pageSize={MEMBERS_PAGE_SIZE}
        total={total}
        noun={t("circle.table.noun")}
      />
    </div>
  );
}
