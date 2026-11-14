"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { StateView } from "@/components/kit";
import { notify } from "@/lib/toast";
import { CORE_DOWNLOAD_URL } from "@/lib/wagmi";

import { useCoreWallet } from "./use-core-wallet";

/**
 * Gate for wallet-only screens: shows the right "access" state (docs/ui.md §10)
 * until Core is installed, connected and on the supported network.
 */
export function RequireWallet({ children }: { children: React.ReactNode }) {
  const w = useCoreWallet();

  if (w.status === "connecting") {
    return (
      <StateView
        state="loading"
        label="Connecting to Core"
        skeleton={
          <div className="grid gap-5">
            <Skeleton className="h-36 rounded-[14px]" />
            <Skeleton className="h-24 rounded-[14px]" />
          </div>
        }
      />
    );
  }

  if (w.status === "no-core") {
    return (
      <StateView
        state="access"
        reason="no-wallet"
        actionLabel="Get Core wallet"
        onAction={() => window.open(CORE_DOWNLOAD_URL, "_blank", "noopener,noreferrer")}
      />
    );
  }

  if (w.status === "disconnected") {
    return (
      <StateView
        state="access"
        reason="no-wallet"
        actionLabel="Connect Core"
        onAction={() => w.connect().catch((e) => notify.error(e))}
      />
    );
  }

  if (w.status === "wrong-network") {
    return (
      <StateView
        state="access"
        reason="wrong-network"
        actionLabel={`Switch to ${w.targetChain.name}`}
        onAction={() => w.switchToTarget().catch((e) => notify.error(e))}
      />
    );
  }

  return <>{children}</>;
}
