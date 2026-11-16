"use client";

import { circleFactoryAbi } from "@wealthkart/sdk";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { readContract } from "wagmi/actions";

import { PageHeader } from "@/components/app/page-header";
import { Pagination, usePageParam } from "@/components/app/pagination";
import { CircleCover } from "@/components/art";
import { ErrorBoundary, StateView } from "@/components/kit";
import { DeviceRemindersCard } from "@/components/reminders/device-reminders-card";
import { ReminderSwitch } from "@/components/reminders/reminder-switch";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { CIRCLES_PAGE_SIZE, useFactory, useMyCircles } from "@/lib/circle";
import { ALL_KINDS, KIND_ROWS, hasKind } from "@/lib/push";
import { notify } from "@/lib/toast";
import { reminderError, useReminders } from "@/lib/use-reminders";
import { wagmiConfig } from "@/lib/wagmi";

/** Most circles switched on in one go when reminders are turned on here. */
const TURN_ON_MAX = 50n;

/** Settings: reminders on this device, and per circle (ADR 0052). */
export default function SettingsPage() {
  return (
    <RequireWallet>
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
    </RequireWallet>
  );
}

function Settings() {
  const r = useReminders();
  const { address } = useCoreWallet();
  const factory = useFactory();
  // Read at the moment of turning on, never from a cache: a circle joined a moment ago must be
  // included. The newest TURN_ON_MAX circles; each circle page can still switch its own on.
  const circleIds = useCallback(async (): Promise<string[]> => {
    if (!factory || !address) return [];
    const total = (await readContract(wagmiConfig, {
      abi: circleFactoryAbi,
      address: factory,
      functionName: "circlesOfCount",
      args: [address],
    })) as bigint;
    const list = (await readContract(wagmiConfig, {
      abi: circleFactoryAbi,
      address: factory,
      functionName: "circlesOf",
      args: [address, total > TURN_ON_MAX ? total - TURN_ON_MAX : 0n, TURN_ON_MAX],
    })) as readonly Address[];
    return list.map((a) => a.toLowerCase());
  }, [factory, address]);

  return (
    <>
      <PageHeader title="Settings" subtitle="How WealthKart keeps in touch on this device." />
      <ErrorBoundary preset="widget" name="Reminders">
        <DeviceRemindersCard reminders={r} circles={circleIds} />
      </ErrorBoundary>
      {r.status === "on" && (
        <section className="mt-16">
          <h2 className="mb-6 text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
            Reminders per circle
          </h2>
          <ErrorBoundary preset="widget" name="Reminders per circle">
            <CircleList reminders={r} />
          </ErrorBoundary>
        </section>
      )}
    </>
  );
}

function CircleList({ reminders: r }: { reminders: ReturnType<typeof useReminders> }) {
  const page = usePageParam();
  const q = useMyCircles(page);
  const [busy, setBusy] = useState<string | null>(null);
  // The list may be cached from the home page; read it again so new circles show.
  const refetch = q.refetch;
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (q.isPending || r.settings.isPending) {
    return (
      <StateView
        state="loading"
        label="Loading your circles"
        skeleton={
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[76px] rounded-[14px]" />
            ))}
          </div>
        }
      />
    );
  }
  if (q.isError || r.settings.isError) {
    return (
      <StateView
        state="error"
        onRetry={() => {
          q.refetch();
          void r.settings.refetch();
        }}
      />
    );
  }
  if (q.circles.length === 0) {
    return (
      <StateView
        state="empty"
        message="You're not in a circle yet. Once you join one, you can choose its reminders here."
      />
    );
  }

  async function setAll(circle: string, on: boolean) {
    setBusy(circle);
    try {
      await r.setCircle.mutateAsync({ circle, kinds: on ? ALL_KINDS : 0 });
    } catch (err) {
      notify.error(reminderError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card">
      <ul className="divide-y divide-line-soft">
        {q.circles.map((c) => {
          const kinds = r.kindsFor(c.address);
          const count = KIND_ROWS.filter((row) => hasKind(kinds, row.kind)).length;
          return (
            <li key={c.address} className="flex items-center gap-5 px-6 py-3">
              <div className="h-11 w-16 shrink-0 overflow-hidden rounded-[8px] border border-line-soft">
                <CircleCover address={c.address} name={c.name} />
              </div>
              <div className="min-w-0 flex-1">
                <ReminderSwitch
                  label={c.name}
                  hint={
                    count === 0
                      ? "Off"
                      : count === KIND_ROWS.length
                        ? "All reminders on"
                        : `${count} of ${KIND_ROWS.length} reminders on`
                  }
                  checked={count > 0}
                  busy={busy === c.address}
                  disabled={busy !== null}
                  onChange={(on) => void setAll(c.address, on)}
                />
              </div>
              <Link
                href={`/app/circle/?id=${c.address}#reminders`}
                className="hidden shrink-0 text-[13px] font-medium text-brand underline-offset-4 hover:underline sm:inline"
              >
                Choose which
              </Link>
            </li>
          );
        })}
      </ul>
      <Pagination page={page} pageSize={CIRCLES_PAGE_SIZE} total={q.total ?? 0} noun="circles" />
    </div>
  );
}
