"use client";

import { DEPLOYMENTS, circleFactoryAbi } from "@wealthkart/sdk";
import { Plus } from "lucide-react";
import { useReadContract } from "wagmi";

import { PageHeader } from "@/components/app/page-header";
import { Button, SpotPlaceholder, StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";

/** Home / Portfolio: all of this wallet's circles and what needs doing now. */
export default function PortfolioPage() {
  return (
    <RequireWallet>
      <Portfolio />
    </RequireWallet>
  );
}

function Portfolio() {
  const { address, chainId } = useCoreWallet();
  const factory = chainId ? (DEPLOYMENTS[chainId]?.circleFactory ?? null) : null;

  const count = useReadContract({
    abi: circleFactoryAbi,
    address: factory ?? undefined,
    functionName: "circlesOfCount",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(factory && address) },
  });

  const header = (
    <PageHeader
      title="Your circles"
      subtitle="Everything you've put in, across every circle you're part of."
      actions={
        <Button icon={Plus} disabled disabledReason="Creating circles opens in the next update">
          Start a circle
        </Button>
      }
    />
  );

  if (factory && count.isPending) {
    return (
      <>
        {header}
        <StateView
          state="loading"
          label="Loading your circles"
          skeleton={
            <div className="grid gap-6 sm:grid-cols-2">
              <Skeleton className="h-44 rounded-[14px]" />
              <Skeleton className="h-44 rounded-[14px]" />
            </div>
          }
        />
      </>
    );
  }

  if (factory && count.isError) {
    return (
      <>
        {header}
        <StateView state="error" onRetry={() => count.refetch()} />
      </>
    );
  }

  // No factory deployed on this network yet, or the wallet has no circles.
  return (
    <>
      {header}
      <StateView
        state="empty"
        illustration={<SpotPlaceholder />}
        message="You're not in any circle yet. Start one with friends, or open an invite link a friend sent you."
      />
    </>
  );
}
