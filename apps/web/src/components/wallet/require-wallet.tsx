"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { loginHref } from "@/components/login/safe-next";
import { Skeleton } from "@/components/ui/skeleton";
import { StateView } from "@/components/kit";
import { notify } from "@/lib/toast";

import { useCoreWallet } from "./use-core-wallet";

const REDIRECT_GRACE_MS = 400;

/**
 * Gate for wallet-only screens. Signed out (or no Core) goes to the sign-in page and comes
 * back afterwards; a wrong network shows the switch state in place (docs/ui.md §10).
 */
export function RequireWallet({ children }: { children: React.ReactNode }) {
  const w = useCoreWallet();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const signedOut = w.status === "no-core" || w.status === "disconnected";

  useEffect(() => {
    if (!signedOut) return;
    // wagmi reports "disconnected" for a moment before it reconnects a returning wallet;
    // wait briefly so signed-in people never bounce through the sign-in page.
    const t = setTimeout(
      () => router.replace(loginHref(search ? `${pathname}?${search}` : pathname)),
      REDIRECT_GRACE_MS,
    );
    return () => clearTimeout(t);
  }, [signedOut, pathname, search, router]);

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

  if (signedOut) {
    return (
      <StateView
        state="loading"
        label="Taking you to sign in"
        skeleton={<Skeleton className="h-36 rounded-[14px]" />}
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
