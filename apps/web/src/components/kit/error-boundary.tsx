"use client";

import * as React from "react";
import { CircleAlert, RefreshCw, RotateCw } from "lucide-react";

import { messages } from "@/lib/messages";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Details } from "./details";

/**
 * Error boundaries at three levels (docs/ui.md §11) so one broken part never
 * takes down more than itself:
 *
 * - app:    full-page friendly error + Reload (wraps the whole app in the root layout)
 * - page:   section-sized error + Try again (wrap each page's content)
 * - widget: card-sized error + Retry (wrap each chart, list or card)
 *
 * The main message never shows raw error text; it sits behind "Details".
 */
export type ErrorBoundaryPreset = "app" | "page" | "widget";

export interface ErrorBoundaryProps {
  preset: ErrorBoundaryPreset;
  children: React.ReactNode;
  /** Called when the user retries, before the children re-render. */
  onReset?: () => void;
  /** Called once per caught error, for logging. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
  /** Shown in the widget card, e.g. "Contributions chart". */
  name?: string;
  className?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.preset}]`, error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorFallback
        preset={this.props.preset}
        error={error}
        onReset={this.reset}
        name={this.props.name}
        className={this.props.className}
      />
    );
  }
}

function errorDetails(error: Error): string {
  const lines = [`${error.name}: ${error.message}`];
  if (error.stack) lines.push(error.stack.split("\n").slice(1, 6).join("\n"));
  return lines.join("\n");
}

function ErrorFallback({
  preset,
  error,
  onReset,
  name,
  className,
}: {
  preset: ErrorBoundaryPreset;
  error: Error;
  onReset: () => void;
  name?: string;
  className?: string;
}) {
  const details = errorDetails(error);

  if (preset === "app") {
    return (
      <main
        role="alert"
        data-boundary="app"
        className={cn(
          "mx-auto flex min-h-dvh max-w-[560px] flex-col items-start justify-center gap-6 px-[22px] py-24 sm:px-10",
          className,
        )}
      >
        <span className="font-display text-[26px] tracking-tight">WealthKart</span>
        <h1 className="font-display text-[clamp(36px,5vw,52px)] leading-[1.05] tracking-tight">
          {messages.appErrorTitle()}
        </h1>
        <p className="max-w-[46ch] text-[16px] leading-relaxed text-muted-foreground">
          {messages.unknown()}
        </p>
        <Button
          icon={RotateCw}
          iconAnimation="spin"
          workingLabel="Reloading…"
          onAction={() => window.location.reload()}
        >
          Reload
        </Button>
        <Details>{details}</Details>
      </main>
    );
  }

  if (preset === "page") {
    return (
      <section
        role="alert"
        data-boundary="page"
        className={cn(
          "flex flex-col items-start gap-4 rounded-[14px] border border-border bg-card p-8 sm:p-10",
          className,
        )}
      >
        <h2 className="font-display text-[30px] leading-tight tracking-tight">
          {messages.pageErrorTitle()}
        </h2>
        <p className="max-w-[48ch] text-[15px] leading-relaxed text-muted-foreground">
          {messages.unknown()}
        </p>
        <Button icon={RefreshCw} iconAnimation="spin" onClick={onReset} className="mt-2">
          Try again
        </Button>
        <Details>{details}</Details>
      </section>
    );
  }

  return (
    <div
      role="alert"
      data-boundary="widget"
      className={cn(
        "flex flex-col items-start gap-3 rounded-[14px] border border-border bg-card p-7",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-bad-soft text-bad"
          aria-hidden
        >
          <CircleAlert size={17} strokeWidth={1.5} />
        </span>
        <div className="space-y-1">
          <p className="text-[15px] font-semibold text-foreground">
            {messages.widgetErrorTitle(name)}
          </p>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            {messages.widgetErrorBody()}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-5 pl-11">
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          iconAnimation="spin"
          onClick={onReset}
        >
          Retry
        </Button>
        <Details>{details}</Details>
      </div>
    </div>
  );
}
