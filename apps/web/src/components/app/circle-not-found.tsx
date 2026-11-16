"use client";

import { useRouter } from "next/navigation";

import { InlineAlert, StateView } from "@/components/kit";
import { useT } from "@/i18n/react";
import { messages } from "@/lib/messages";

/**
 * Shown for any circle page whose `?id=` is missing, unknown on this network, or not a
 * WealthKart circle at all (RT-01). The last case gets a clear "don't pay this" warning.
 */
export function CircleNotFound({ notACircle = false }: { notACircle?: boolean }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <div className="grid max-w-[640px] gap-6">
      {notACircle && <InlineAlert tone="bad">{messages.notACircle()}</InlineAlert>}
      <StateView
        state="empty"
        message={notACircle ? t("kit.notACircleHint") : t("kit.circleNotFound")}
        action={{ label: t("kit.goToCircles"), onAction: () => router.push("/app/") }}
      />
    </div>
  );
}
