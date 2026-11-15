"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CircleNotFound } from "@/components/app/circle-not-found";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, usePageParam } from "@/components/app/pagination";
import { ErrorBoundary, StateView } from "@/components/kit";
import { PauseBanner } from "@/components/exits/pause";
import { DissolvedNotice, RuleChangeBanner } from "@/components/governance/circle-notices";
import { NewProposalButton } from "@/components/governance/new-proposal-dialog";
import { ProposalCard } from "@/components/governance/proposal-card";
import { LoanRequestCard } from "@/components/loans/loan-request-card";
import { RequestCard } from "@/components/membership/request-card";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { type CircleGov, PROPOSALS_PAGE_SIZE, useCircleGov, useProposals } from "@/lib/gov-hooks";
import { LOAN_REQUESTS_PAGE_SIZE, useOpenLoanRequests } from "@/lib/loan-hooks";
import {
  parseCircleId,
  REQUESTS_PAGE_SIZE,
  useChainNow,
  useCircle,
  useJoinRequests,
} from "@/lib/circle";
import type { Address } from "viem";

export default function VotesPage() {
  return (
    <RequireWallet>
      <Suspense fallback={null}>
        <Votes />
      </Suspense>
    </RequireWallet>
  );
}

function Votes() {
  const id = parseCircleId(useSearchParams().get("id"));
  const c = useCircle(id);
  const g = useCircleGov(id);
  const chainNow = useChainNow();
  const { address } = useCoreWallet();

  if (!id || c.notFound) return <CircleNotFound notACircle={c.notACircle} />;
  if (c.isPending || !c.data) {
    return (
      <StateView
        state="loading"
        label="Loading votes"
        skeleton={<Skeleton className="h-64 max-w-[760px] rounded-[14px]" />}
      />
    );
  }
  if (c.isError) return <StateView state="error" onRetry={() => c.refetch()} />;
  if (!c.data.isMember) return <StateView state="access" reason="not-member" />;

  const d = c.data;
  const gov = g.data;
  const hours = Math.round(d.votingWindow / 3600);
  const refetchAll = () => {
    void c.refetch();
    void g.refetch();
  };
  return (
    <div className="max-w-[760px]">
      <PageHeader
        title="Votes"
        subtitle={`${d.name} · proposals, loans, people asking to join, and members the circle may mark dormant. At least ${d.quorumPct}% of members must vote, and each vote stays open ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`}.`}
        actions={
          gov?.rules && !gov.dissolved ? (
            <NewProposalButton
              circle={id}
              rules={gov.rules}
              installment={d.installment}
              guardianDisabled={gov.guardianDisabled}
              chainNow={chainNow}
              me={address}
              onCreated={refetchAll}
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
          <RuleChangeBanner circle={id} gov={gov} chainNow={chainNow} onChanged={refetchAll} />
        </div>
      )}
      <section aria-labelledby="proposals-heading" className="mb-16 grid gap-6">
        <h2
          id="proposals-heading"
          className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          Circle proposals
        </h2>
        <ErrorBoundary preset="widget" name="Proposals">
          <ProposalList
            id={id}
            gov={gov}
            quorumPct={d.quorumPct}
            chainNow={chainNow}
            onChanged={refetchAll}
          />
        </ErrorBoundary>
      </section>
      <section aria-labelledby="loans-heading" className="mb-16 grid gap-6">
        <h2
          id="loans-heading"
          className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          Loans
        </h2>
        <ErrorBoundary preset="widget" name="Loan votes">
          <LoanRequestList
            id={id}
            passPct={gov?.rules?.passPct ?? 50}
            quorumPct={d.quorumPct}
            chainNow={chainNow}
            onChanged={refetchAll}
          />
        </ErrorBoundary>
      </section>
      <section aria-labelledby="requests-heading" className="grid gap-6">
        <h2
          id="requests-heading"
          className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          Joining and dormant members
        </h2>
        <ErrorBoundary preset="widget" name="Open votes">
          <RequestList
            id={id}
            quorumPct={d.quorumPct}
            memberCount={Number(d.memberCount)}
            onChanged={() => void c.refetch()}
          />
        </ErrorBoundary>
      </section>
    </div>
  );
}

function ProposalList({
  id,
  gov,
  quorumPct,
  chainNow,
  onChanged,
}: {
  id: Address;
  gov: CircleGov | undefined;
  quorumPct: number;
  chainNow: number;
  onChanged: () => void;
}) {
  const page = usePageParam("ppage");
  const q = useProposals(id, page);
  const { address } = useCoreWallet();

  if (q.isPending) {
    return (
      <StateView
        state="loading"
        label="Loading proposals"
        skeleton={<Skeleton className="h-52 rounded-[14px]" />}
      />
    );
  }
  if (q.isError) return <StateView state="error" onRetry={q.refetch} />;
  if (q.proposals.length === 0) {
    return (
      <StateView
        state="empty"
        message="No proposals open. Use New proposal to suggest a rule change, a fee waiver, closing the circle or switching off the guardian."
      />
    );
  }
  return (
    <div className="grid gap-8">
      <div className="grid gap-6">
        {q.proposals.map((p) => (
          <ProposalCard
            key={String(p.id)}
            circle={id}
            proposal={p}
            quorumPct={quorumPct}
            chainNow={chainNow}
            rules={gov?.rules ?? null}
            me={address}
            onChanged={() => {
              q.refetch();
              onChanged();
            }}
          />
        ))}
      </div>
      <Pagination
        page={page}
        pageSize={PROPOSALS_PAGE_SIZE}
        total={q.total}
        noun="proposals"
        param="ppage"
      />
    </div>
  );
}

function LoanRequestList({
  id,
  passPct,
  quorumPct,
  chainNow,
  onChanged,
}: {
  id: Address;
  passPct: number;
  quorumPct: number;
  chainNow: number;
  onChanged: () => void;
}) {
  const router = useRouter();
  const page = usePageParam("lpage");
  const q = useOpenLoanRequests(id, page);
  const { address } = useCoreWallet();

  if (q.isPending) {
    return (
      <StateView
        state="loading"
        label="Loading loan votes"
        skeleton={<Skeleton className="h-52 rounded-[14px]" />}
      />
    );
  }
  if (q.isError) return <StateView state="error" onRetry={q.refetch} />;
  if (q.total === 0) {
    return (
      <StateView
        state="empty"
        message="No loans to vote on. When a member asks for a loan, or the circle needs to settle one, it shows up here."
        action={{
          label: "Go to Loans",
          onAction: () => router.push(`/app/circle/loans/?id=${id}`),
        }}
      />
    );
  }
  return (
    <div className="grid gap-8">
      <div className="grid gap-6">
        {q.requests.map((r) => (
          <LoanRequestCard
            key={String(r.id)}
            circle={id}
            request={r}
            passPct={passPct}
            quorumPct={quorumPct}
            chainNow={chainNow}
            me={address}
            onChanged={() => {
              q.refetch();
              onChanged();
            }}
          />
        ))}
      </div>
      <Pagination
        page={page}
        pageSize={LOAN_REQUESTS_PAGE_SIZE}
        total={q.total}
        noun="loan votes"
        param="lpage"
      />
    </div>
  );
}

function RequestList({
  id,
  quorumPct,
  memberCount,
  onChanged,
}: {
  id: Address;
  quorumPct: number;
  memberCount: number;
  onChanged: () => void;
}) {
  const router = useRouter();
  const page = usePageParam();
  const q = useJoinRequests(id, page);
  const chainNow = useChainNow();

  if (q.isPending) {
    return (
      <StateView
        state="loading"
        label="Loading votes"
        skeleton={
          <div className="grid gap-6">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-52 rounded-[14px]" />
            ))}
          </div>
        }
      />
    );
  }
  if (q.isError) return <StateView state="error" onRetry={q.refetch} />;
  if (q.requests.length === 0) {
    return (
      <StateView
        state="empty"
        message="Nothing to vote on right now. Share your invite link from the circle page to bring a friend in."
        action={{ label: "Go to the circle", onAction: () => router.push(`/app/circle/?id=${id}`) }}
      />
    );
  }
  return (
    <div className="grid gap-8">
      <div className="grid gap-6">
        {q.requests.map((r) => (
          <RequestCard
            key={String(r.id)}
            circle={id}
            request={r}
            quorumPct={quorumPct}
            memberCount={memberCount}
            chainNow={chainNow}
            onChanged={() => {
              q.refetch();
              onChanged();
            }}
          />
        ))}
      </div>
      <Pagination page={page} pageSize={REQUESTS_PAGE_SIZE} total={q.total ?? 0} noun="votes" />
    </div>
  );
}
