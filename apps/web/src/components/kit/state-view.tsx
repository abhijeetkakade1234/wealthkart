"use client";

import * as React from "react";
import {
  CircleAlert,
  CircleX,
  History,
  RefreshCw,
  UserPlus,
  Wallet,
  WifiOff,
  Network,
  type LucideIcon,
} from "lucide-react";

import { EmptyArt } from "@/components/art";
import { messages } from "@/lib/messages";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Details } from "./details";

/**
 * Renders exactly one of the eight UI states (docs/ui.md §10). Every data-driven
 * component goes through this, so no screen can forget a state. Pending
 * transactions use `TxTracker`.
 */
export type AccessReason = "no-wallet" | "wrong-network" | "not-member";

export interface StateAction {
  label: string;
  onAction: () => unknown;
  workingLabel?: string;
  icon?: LucideIcon;
}

type Common = { className?: string };

export type StateViewProps = Common &
  (
    | { state: "loading"; skeleton: React.ReactNode; label?: string }
    | { state: "success"; children: React.ReactNode }
    | {
        state: "empty";
        /** One sentence: what is missing and what happens next. */
        message: string;
        illustration?: React.ReactNode;
        action?: StateAction;
      }
    | {
        state: "error";
        /** Defaults to the catalogue's "couldn't load" message. */
        message?: string;
        onRetry: () => unknown;
        details?: string;
      }
    | {
        state: "failed";
        /** What went wrong, in plain words (from the catalogue). */
        message?: string;
        /** What to do next. */
        hint?: string;
        onRetry?: () => unknown;
        details?: string;
      }
    | {
        state: "stale";
        children: React.ReactNode;
        /** When the shown data was saved. */
        savedAt: Date | number;
        /** Current time (for tests and static rendering). Defaults to Date.now(). */
        now?: number;
        onRefresh: () => unknown;
      }
    | { state: "offline"; children?: React.ReactNode }
    | {
        state: "access";
        reason: AccessReason;
        onAction?: () => unknown;
        actionLabel?: string;
      }
  );

export type UIState = StateViewProps["state"];

export function StateView(props: StateViewProps) {
  switch (props.state) {
    case "loading":
      return (
        <div
          className={props.className}
          role="status"
          aria-busy="true"
          aria-label={props.label ?? "Loading"}
          data-state="loading"
        >
          {props.skeleton}
        </div>
      );

    case "success":
      return (
        <div className={props.className} data-state="success">
          {props.children}
        </div>
      );

    case "empty":
      return (
        <Panel className={props.className} state="empty">
          <div className="mb-2">{props.illustration ?? <SpotPlaceholder />}</div>
          <p className="max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">
            {props.message}
          </p>
          {props.action && (
            <Button
              variant="secondary"
              size="sm"
              icon={props.action.icon}
              workingLabel={props.action.workingLabel}
              onAction={props.action.onAction}
              className="mt-2"
            >
              {props.action.label}
            </Button>
          )}
        </Panel>
      );

    case "error":
      return (
        <Panel className={props.className} state="error" role="alert">
          <StateIcon icon={CircleAlert} tone="bad" />
          <p className="max-w-[48ch] text-[15px] leading-relaxed text-foreground">
            {props.message ?? messages.loadFailed()}
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            iconAnimation="spin"
            workingLabel="Trying again…"
            onAction={props.onRetry}
            className="mt-2"
          >
            Retry
          </Button>
          {props.details && <Details className="mt-1">{props.details}</Details>}
        </Panel>
      );

    case "failed":
      return (
        <Panel className={props.className} state="failed" role="alert" align="start">
          <div className="flex items-start gap-3.5">
            <StateIcon icon={CircleX} tone="bad" />
            <div className="space-y-1.5">
              <p className="text-[15px] leading-relaxed font-semibold text-foreground">
                {props.message ?? messages.txFailed()}
              </p>
              {props.hint && (
                <p className="text-[14.5px] leading-relaxed text-muted-foreground">{props.hint}</p>
              )}
            </div>
          </div>
          {(props.onRetry || props.details) && (
            <div className="flex flex-wrap items-center gap-5 pl-[46px]">
              {props.onRetry && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  iconAnimation="spin"
                  workingLabel="Trying again…"
                  onAction={props.onRetry}
                >
                  Try again
                </Button>
              )}
              {props.details && <Details>{props.details}</Details>}
            </div>
          )}
        </Panel>
      );

    case "stale": {
      const savedAt = typeof props.savedAt === "number" ? props.savedAt : props.savedAt.getTime();
      const minutes = Math.max(0, ((props.now ?? Date.now()) - savedAt) / 60_000);
      return (
        <div className={cn("space-y-4", props.className)} data-state="stale">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-card px-4 py-2.5">
            <p
              className="inline-flex items-center gap-2 text-[13.5px] text-muted-foreground"
              suppressHydrationWarning
            >
              <History size={15} strokeWidth={1.5} aria-hidden />
              {messages.staleNote(minutes)}
            </p>
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              iconAnimation="spin"
              workingLabel="Refreshing…"
              onAction={props.onRefresh}
            >
              Refresh
            </Button>
          </div>
          {props.children}
        </div>
      );
    }

    case "offline":
      return (
        <div className={cn("space-y-4", props.className)} data-state="offline">
          <div
            role="status"
            className="flex items-start gap-3 rounded-[14px] border border-warn/20 bg-warn-soft px-5 py-4 text-[14.5px] leading-relaxed text-foreground"
          >
            <WifiOff
              size={18}
              strokeWidth={1.5}
              className="mt-0.5 shrink-0 text-warn"
              aria-hidden
            />
            <p>{messages.offline()}</p>
          </div>
          {props.children}
        </div>
      );

    case "access": {
      const copy = ACCESS[props.reason];
      return (
        <Panel className={props.className} state="access">
          <StateIcon icon={copy.icon} tone="brand" />
          <h3 className="font-display text-[26px] leading-tight tracking-tight">{copy.title()}</h3>
          <p className="max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">
            {copy.body()}
          </p>
          {props.onAction && (
            <Button onAction={props.onAction} className="mt-3" workingLabel={copy.working}>
              {props.actionLabel ?? copy.action}
            </Button>
          )}
        </Panel>
      );
    }
  }
}

const ACCESS: Record<
  AccessReason,
  { icon: LucideIcon; title: () => string; body: () => string; action: string; working: string }
> = {
  "no-wallet": {
    icon: Wallet,
    title: messages.accessNoWalletTitle,
    body: messages.accessNoWalletBody,
    action: "Connect Core",
    working: "Connecting…",
  },
  "wrong-network": {
    icon: Network,
    title: messages.accessWrongNetworkTitle,
    body: messages.accessWrongNetworkBody,
    action: "Switch to Avalanche",
    working: "Switching…",
  },
  "not-member": {
    icon: UserPlus,
    title: messages.accessNotMemberTitle,
    body: messages.accessNotMemberBody,
    action: "Go to my circles",
    working: "Opening…",
  },
};

function Panel({
  children,
  className,
  state,
  role,
  align = "center",
}: {
  children: React.ReactNode;
  className?: string;
  state: UIState;
  role?: string;
  align?: "center" | "start";
}) {
  return (
    <div
      role={role}
      data-state={state}
      className={cn(
        "flex flex-col gap-3 rounded-[14px] border border-border bg-card p-7 sm:p-8",
        align === "center" ? "items-center py-12 text-center sm:py-14" : "items-stretch",
        className,
      )}
    >
      {children}
    </div>
  );
}

function StateIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: "bad" | "brand" }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
        tone === "bad" ? "bg-bad-soft text-bad" : "bg-brand-soft text-brand",
      )}
      aria-hidden
    >
      <Icon size={17} strokeWidth={1.5} />
    </span>
  );
}

/**
 * Default empty-state spot: the cut-paper "generic" scene from `components/art`
 * (ADR 0025). Decorative. Pass `illustration={<EmptyArt variant="loans" />}` for a
 * page-specific one.
 */
export function SpotPlaceholder({ className }: { className?: string }) {
  return (
    <span className={className} data-testid="spot-placeholder">
      <EmptyArt variant="generic" />
    </span>
  );
}
