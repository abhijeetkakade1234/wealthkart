"use client";

import { ArrowUpRight, Check, CircleHelp, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBalance } from "wagmi";

import { Button } from "@/components/kit";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import {
  type ChecklistItem,
  checklistItems,
  EMPTY_FIRST_RUN,
  type FirstRunState,
  readFirstRun,
  showChecklist,
  writeFirstRun,
} from "@/lib/first-run";
import { messages } from "@/lib/messages";
import { useBackupCoverage } from "@/lib/nominee-hooks";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { TARGET_CHAIN } from "@/lib/wagmi";

/**
 * "Before you start" on the home screen (ADR 0054). Shows for a wallet until every item is
 * done or the person hides it; each item links to the step in the `/start` guide.
 *
 * @param inCircle true/false once known, undefined while loading, null if it couldn't load.
 */
export function FirstRunChecklist({ inCircle }: { inCircle: boolean | undefined | null }) {
  const { address } = useCoreWallet();
  const balance = useBalance({ address, query: { enabled: Boolean(address) } });
  const backup = useBackupCoverage();
  const [state, setState] = useState<FirstRunState | null>(null);

  // Stored per wallet; read after mount so the static HTML never depends on storage.
  useEffect(() => {
    setState(address ? readFirstRun(address) : null);
  }, [address]);

  if (!address || !state) return null;

  const hasGas = balance.isError ? null : balance.data ? balance.data.value > 0n : undefined;
  const items = checklistItems({
    hasGas,
    inCircle,
    hasNominee: backup.allSet,
    state,
    testnet: Boolean(TARGET_CHAIN.testnet),
  });
  if (!showChecklist(items, state)) return null;

  const done = items.filter((i) => i.status === "done").length;

  function update(next: FirstRunState) {
    if (!address) return;
    setState(next);
    writeFirstRun(address, next);
  }

  return (
    <section
      aria-labelledby="first-run-h"
      data-testid="first-run-checklist"
      className="mb-14 rounded-[14px] border border-border bg-card px-6 py-7 sm:px-8"
    >
      <div className="flex items-start justify-between gap-6">
        <div className="grid gap-1.5">
          <h2 id="first-run-h" className="font-display text-[26px] leading-tight">
            Before you start
          </h2>
          <p className="text-[13.5px] text-muted-foreground">
            {done} of {items.length} done.{" "}
            <Link href="/start/" className="text-brand underline-offset-4 hover:underline">
              Read the full guide
            </Link>
          </p>
        </div>
        <button
          type="button"
          aria-label="Hide this checklist"
          onClick={() => {
            update({ ...(state ?? EMPTY_FIRST_RUN), dismissed: true });
            notify.info(messages.checklistHidden());
          }}
          className="-mr-2 -mt-1 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-95"
        >
          <X className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div
        className="mt-6 h-px w-full overflow-hidden bg-line-soft"
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={done}
      >
        <div
          className="h-px bg-brand transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${String((done / items.length) * 100)}%` }}
        />
      </div>

      <ul className="mt-2 grid">
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            onToggle={
              item.manual
                ? () =>
                    update({
                      ...state,
                      [item.id]: item.status !== "done",
                    })
                : undefined
            }
          />
        ))}
      </ul>
    </section>
  );
}

function StatusMark({ status }: { status: ChecklistItem["status"] }) {
  const base = "inline-flex size-7 shrink-0 items-center justify-center rounded-full border";
  if (status === "done") {
    return (
      <span className={cn(base, "border-brand bg-brand text-primary-foreground")}>
        <Check className="size-3.5" strokeWidth={2} aria-hidden />
      </span>
    );
  }
  if (status === "checking") {
    return (
      <span className={cn(base, "border-border text-muted-foreground")}>
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      </span>
    );
  }
  if (status === "unknown") {
    return (
      <span className={cn(base, "border-border text-muted-foreground")}>
        <CircleHelp className="size-3.5" strokeWidth={1.5} aria-hidden />
      </span>
    );
  }
  return <span className={cn(base, "border-border")} />;
}

const STATUS_TEXT: Record<ChecklistItem["status"], string> = {
  done: "Done",
  todo: "To do",
  checking: "Checking",
  unknown: messages.checklistCantCheck(),
};

function ChecklistRow({ item, onToggle }: { item: ChecklistItem; onToggle?: () => void }) {
  const done = item.status === "done";
  return (
    <li
      className="flex flex-col gap-4 border-b border-line-soft py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`checklist-${item.id}`}
      data-status={item.status}
    >
      <div className="flex items-start gap-4">
        <StatusMark status={item.status} />
        <div className="grid gap-1">
          <span className={cn("text-[15px] font-medium", done && "text-muted-foreground")}>
            {item.title}
            <span className="sr-only">: {STATUS_TEXT[item.status]}</span>
          </span>
          <span className="text-[13px] text-muted-foreground">
            {item.status === "unknown" ? STATUS_TEXT.unknown : item.hint}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
        {!done && (
          <Link
            href={item.href}
            className="group inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13.5px] text-brand transition-colors hover:bg-brand-soft"
            aria-label={`How to: ${item.title}`}
          >
            Show me how
            <ArrowUpRight
              className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              strokeWidth={1.75}
              aria-hidden
            />
          </Link>
        )}
        {onToggle && (
          <Button size="sm" variant={done ? "ghost" : "secondary"} onClick={onToggle}>
            {done ? "Undo" : "I've done this"}
          </Button>
        )}
      </div>
    </li>
  );
}
