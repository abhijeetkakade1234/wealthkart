"use client";

import { periodOf } from "@wealthkart/rules";
import { shortAddress } from "@wealthkart/sdk";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import type { Address } from "viem";

import { CircleNotFound } from "@/components/app/circle-not-found";
import { PageHeader } from "@/components/app/page-header";
import { ErrorBoundary, InlineAlert, StateView } from "@/components/kit";
import { PauseBanner } from "@/components/exits/pause";
import { DissolvedNotice } from "@/components/governance/circle-notices";
import { AskLoanButton } from "@/components/loans/ask-loan-dialog";
import { GuarantorNotice } from "@/components/loans/guarantor-notice";
import { LoansList } from "@/components/loans/loans-list";
import { MyLoanPanel } from "@/components/loans/my-loan";
import { SectionLabel } from "@/components/loans/parts";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { parseCircleId, useChainNow, useCircle } from "@/lib/circle";
import { useCircleEvents } from "@/lib/events";
import { useCircleGov } from "@/lib/gov-hooks";
import { isAhead } from "@/lib/governance";
import { useMemberName, useMyLoan, useOpenLoanRequests } from "@/lib/loan-hooks";
import { askBlocker, avax, loansFromLogs } from "@/lib/loans";

export default function LoansPage() {
  return (
    <RequireWallet>
      <Suspense fallback={null}>
        <Loans />
      </Suspense>
    </RequireWallet>
  );
}

function Loans() {
  const id = parseCircleId(useSearchParams().get("id"));
  const c = useCircle(id);
  const g = useCircleGov(id);
  const my = useMyLoan(id);
  const open = useOpenLoanRequests(id);
  const chainNow = useChainNow();
  const { address } = useCoreWallet();
  const guarantorName = useMemberName(id, my.data?.loan?.guarantor);

  if (!id || c.notFound) return <CircleNotFound notACircle={c.notACircle} />;
  if (c.isPending || !c.data) {
    return (
      <StateView
        state="loading"
        label="Loading loans"
        skeleton={
          <div className="grid max-w-[960px] gap-8">
            <Skeleton className="h-12 w-60 rounded-lg" />
            <Skeleton className="h-72 rounded-[14px]" />
          </div>
        }
      />
    );
  }
  if (c.isError) return <StateView state="error" onRetry={() => c.refetch()} />;
  if (!c.data.isMember) return <StateView state="access" reason="not-member" />;

  const d = c.data;
  const gov = g.data;
  const rules = gov?.rules ?? null;
  const currentPeriod = periodOf(chainNow);
  const refetchAll = () => {
    void c.refetch();
    void g.refetch();
    void my.refetch();
    open.refetch();
  };
  const blocked =
    my.data && rules && gov
      ? askBlocker({
          voter: my.data.voter,
          frozen: my.data.frozen,
          dormant: my.data.dormant,
          hasLoan: my.data.loan !== null,
          hasRequest: my.data.pendingId > 0n,
          memberCount: my.data.memberCount,
          minMembersForLoans: rules.minMembersForLoans,
          paused: isAhead(gov.pausedUntil, chainNow),
          dissolved: gov.dissolved,
        })
      : "Loading…";
  const lower = address?.toLowerCase();
  const asked = open.all.filter(
    (r) =>
      r.kind === "loan" &&
      r.status === "open" &&
      !r.guarantorAccepted &&
      r.guarantor.toLowerCase() === lower &&
      chainNow <= r.deadline,
  );

  return (
    <div className="max-w-[960px]">
      <PageHeader
        title="Loans"
        subtitle={`${d.name} · borrow from the circle when you need to. Members vote, and the AVAX goes out on its own.`}
        actions={
          rules && my.data && address ? (
            <AskLoanButton
              circle={id}
              me={address}
              rules={rules}
              my={my.data}
              currentPeriod={currentPeriod}
              dueDay={d.dueDay}
              blocked={blocked}
              onAsked={refetchAll}
            />
          ) : undefined
        }
      />

      {gov && (
        <div className="mb-12 grid gap-5 empty:hidden">
          <PauseBanner circle={id} gov={gov} chainNow={chainNow} onChanged={refetchAll} />
          <DissolvedNotice
            circle={id}
            gov={gov}
            isMember={d.isMember}
            share={d.stake}
            onChanged={refetchAll}
          />
        </div>
      )}

      {asked.length > 0 && (
        <div className="mb-12 grid gap-5">
          {asked.map((r) => (
            <ErrorBoundary key={String(r.id)} preset="widget" name="Guarantor request">
              <GuarantorNotice circle={id} request={r} onChanged={refetchAll} />
            </ErrorBoundary>
          ))}
        </div>
      )}

      <section aria-labelledby="mine-heading" className="mb-16 grid gap-6">
        <SectionLabel id="mine-heading">Yours</SectionLabel>
        <ErrorBoundary preset="widget" name="Your loan">
          {my.isPending || !rules ? (
            <StateView
              state="loading"
              label="Loading your loan"
              skeleton={<Skeleton className="h-72 rounded-[14px]" />}
            />
          ) : my.isError || !my.data ? (
            <StateView state="error" onRetry={() => my.refetch()} />
          ) : (
            <div className="grid gap-5">
              <MyLoanPanel
                circle={id}
                my={my.data}
                rules={rules}
                currentPeriod={currentPeriod}
                chainNow={chainNow}
                dueDay={d.dueDay}
                quorumPct={d.quorumPct}
                guarantorName={guarantorName}
                onChanged={refetchAll}
              />
              {blocked && !my.data.loan && my.data.pendingId === 0n && blocked !== "Loading…" && (
                <p className="text-[13px] text-muted-foreground" data-testid="ask-blocked">
                  {blocked}
                </p>
              )}
              <Backing circle={id} me={address} />
            </div>
          )}
        </ErrorBoundary>
      </section>

      <section aria-labelledby="all-heading" className="grid gap-6">
        <SectionLabel id="all-heading">All loans</SectionLabel>
        <ErrorBoundary preset="widget" name="All loans">
          {rules ? (
            <LoansList
              circle={id}
              me={address}
              rules={rules}
              currentPeriod={currentPeriod}
              openRequests={open.all}
              onChanged={refetchAll}
            />
          ) : (
            <StateView
              state="loading"
              label="Loading loans"
              skeleton={<Skeleton className="h-52 rounded-[14px]" />}
            />
          )}
        </ErrorBoundary>
      </section>
    </div>
  );
}

/** Loans you back as guarantor (from the circle's events), with what that means now. */
function Backing({ circle, me }: { circle: Address; me: Address | undefined }) {
  const q = useCircleEvents(circle);
  const lower = me?.toLowerCase();
  const backed = useMemo(
    () =>
      (q.data ? loansFromLogs(q.data.logs) : []).filter(
        (r) =>
          (r.status === "active" || r.status === "default") && r.guarantor.toLowerCase() === lower,
      ),
    [q.data, lower],
  );
  return (
    <>
      {backed.map((r) => (
        <BackingLine
          key={r.requestId}
          circle={circle}
          borrower={r.borrower}
          outstanding={r.outstanding}
          defaulted={r.status === "default"}
        />
      ))}
    </>
  );
}

function BackingLine({
  circle,
  borrower,
  outstanding,
  defaulted,
}: {
  circle: Address;
  borrower: string;
  outstanding: bigint;
  defaulted: boolean;
}) {
  const name = useMemberName(circle, borrower) || shortAddress(borrower);
  return defaulted ? (
    <InlineAlert tone="bad" title={`${name}'s loan is in default`}>
      You back it, so you&apos;re frozen too until it&apos;s paid: no leaving and no new loans. If
      it isn&apos;t paid, the circle can vote to use your share after theirs.
    </InlineAlert>
  ) : (
    <InlineAlert tone="info" title={`You're backing ${name}'s loan`}>
      {avax(outstanding)} AVAX is still owed. You can leave the circle once it&apos;s repaid.
    </InlineAlert>
  );
}
