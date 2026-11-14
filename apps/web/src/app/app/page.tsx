"use client";

import { formatAvax, periodLabel } from "@wealthkart/sdk";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { Pagination, usePageParam } from "@/components/app/pagination";
import { Button, SpotPlaceholder, StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { CIRCLES_PAGE_SIZE, type CircleSummary, useMyCircles } from "@/lib/circle";

/** Home / Portfolio: every circle this wallet is in, and what needs doing now. */
export default function PortfolioPage() {
  return (
    <RequireWallet>
      <Suspense fallback={null}>
        <Portfolio />
      </Suspense>
    </RequireWallet>
  );
}

function Portfolio() {
  const router = useRouter();
  const page = usePageParam();
  const q = useMyCircles(page);

  const header = (
    <PageHeader
      title="Your circles"
      subtitle="Everything you've put in, across every circle you're part of."
      actions={
        <Button
          icon={Plus}
          onClick={() => router.push("/app/new/")}
          disabled={!q.factory}
          disabledReason="WealthKart isn't live on this network yet"
        >
          Start a circle
        </Button>
      }
    />
  );

  if (q.isPending) {
    return (
      <>
        {header}
        <StateView
          state="loading"
          label="Loading your circles"
          skeleton={
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-52 rounded-[14px]" />
              ))}
            </div>
          }
        />
      </>
    );
  }

  if (q.isError) {
    return (
      <>
        {header}
        <StateView state="error" onRetry={q.refetch} />
      </>
    );
  }

  if (!q.factory || !q.total) {
    return (
      <>
        {header}
        <StateView
          state="empty"
          illustration={<SpotPlaceholder />}
          message={
            q.factory
              ? "You're not in any circle yet. Start one with friends, or open an invite link a friend sent you."
              : "WealthKart isn't live on this network yet. Check back soon."
          }
        />
      </>
    );
  }

  const totalStake = q.circles.reduce((sum, c) => sum + c.stake, 0n);

  return (
    <>
      {header}
      <p className="mb-10 text-[14.5px] text-muted-foreground">
        Your stake on this page:{" "}
        <span className="font-display text-[22px] text-foreground tabular">
          {formatAvax(totalStake)}
        </span>{" "}
        AVAX
      </p>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {q.circles.map((c) => (
          <CircleCard key={c.address} circle={c} />
        ))}
      </div>
      <div className="mt-10 rounded-[14px] border border-border bg-card">
        <Pagination page={page} pageSize={CIRCLES_PAGE_SIZE} total={q.total} noun="circles" />
      </div>
    </>
  );
}

function CircleCard({ circle: c }: { circle: CircleSummary }) {
  const owes = c.due?.payable;
  return (
    <Link
      href={`/app/circle/?id=${c.address}`}
      className="group grid content-between gap-8 rounded-[14px] border border-border bg-card p-[26px] transition-colors hover:border-foreground/30"
    >
      <div className="grid gap-1.5">
        <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          {String(c.memberCount)} members
        </span>
        <span className="font-display text-[28px] leading-tight">{c.name}</span>
      </div>
      <div className="grid gap-1">
        <span className="text-[12.5px] text-muted-foreground">Your stake</span>
        <span className="font-display text-[34px] leading-none tabular">
          {formatAvax(c.stake)}
          <small className="ml-1.5 font-sans text-[13px] text-muted-foreground">AVAX</small>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        {!c.isMember ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
            Not joined
          </span>
        ) : owes && c.due ? (
          <span className="rounded-full bg-warn-soft px-2.5 py-1 text-warn">
            {formatAvax(c.due.amount)} AVAX due · {periodLabel(c.due.period)}
          </span>
        ) : (
          <span className="rounded-full bg-good-soft px-2.5 py-1 text-good">All paid</span>
        )}
        <ArrowRight
          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </Link>
  );
}
