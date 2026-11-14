"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

import { AnimatedIcon } from "./animated-icon";

/**
 * "Details" toggle for technical information (error codes, raw messages) that
 * support may need but the main message must never show (docs/ui.md §12).
 */
export function Details({ children, className }: { children: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <div className={cn("text-[13px]", className)}>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-brand/35"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        Details
        <AnimatedIcon icon={ChevronDown} animation="rotate" active={open} size={14} />
      </button>
      {open && (
        <pre
          id={id}
          className="mt-3 max-h-48 overflow-auto rounded-[10px] border border-border bg-background p-4 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground"
        >
          {children}
        </pre>
      )}
    </div>
  );
}
