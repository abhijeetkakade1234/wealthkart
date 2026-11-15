"use client";

import { useRouter } from "next/navigation";

import { InlineAlert, StateView } from "@/components/kit";
import { messages } from "@/lib/messages";

/**
 * Shown for any circle page whose `?id=` is missing, unknown on this network, or not a
 * WealthKart circle at all (RT-01). The last case gets a clear "don't pay this" warning.
 */
export function CircleNotFound({ notACircle = false }: { notACircle?: boolean }) {
  const router = useRouter();
  return (
    <div className="grid max-w-[640px] gap-6">
      {notACircle && <InlineAlert tone="bad">{messages.notACircle()}</InlineAlert>}
      <StateView
        state="empty"
        message={
          notACircle
            ? "Only open circles from links your friends send you inside WealthKart."
            : "We couldn't find this circle. Check the link, or make sure your wallet is on the right network."
        }
        action={{ label: "Go to your circles", onAction: () => router.push("/app/") }}
      />
    </div>
  );
}
