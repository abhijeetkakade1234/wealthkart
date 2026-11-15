"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CircleNotFound } from "@/components/app/circle-not-found";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, usePageParam } from "@/components/app/pagination";
import { ErrorBoundary, StateView } from "@/components/kit";
import { RequestCard } from "@/components/membership/request-card";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
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
  const hours = Math.round(d.votingWindow / 3600);
  return (
    <div className="max-w-[760px]">
      <PageHeader
        title="Votes"
        subtitle={`${d.name} · people asking to join, and members the circle may mark dormant. At least ${d.quorumPct}% of members must vote. A newcomer needs 66% yes; pausing someone's payments needs more than half. Each vote stays open ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`}.`}
      />
      <ErrorBoundary preset="widget" name="Open votes">
        <RequestList
          id={id}
          quorumPct={d.quorumPct}
          memberCount={Number(d.memberCount)}
          onChanged={() => void c.refetch()}
        />
      </ErrorBoundary>
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
