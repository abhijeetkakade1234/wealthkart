"use client";

import { circleVaultAbi } from "@wealthkart/sdk";
import { Check, Loader2, X } from "lucide-react";
import type { Address } from "viem";
import { useReadContract } from "wagmi";

import { useT } from "@/i18n/react";
import { displayNameProblem, NAME_MAX } from "@/lib/membership";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import "@/i18n/en/membership";

export const inputCls =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15";

export type NameCheck = "idle" | "invalid" | "checking" | "taken" | "available" | "unchanged";

/** Combines the local rule check and the on-chain availability answer into one state. */
export function useNameCheck(
  circle: Address,
  account: Address | undefined,
  name: string,
  current = "",
) {
  const problem = name ? displayNameProblem(name) : null;
  const debounced = useDebounced(name, 300);
  const settled = debounced === name;
  const unchanged = current !== "" && name === current;
  const q = useReadContract({
    abi: circleVaultAbi,
    address: circle,
    functionName: "isNameAvailable",
    args: account ? [debounced, account] : undefined,
    query: {
      enabled: Boolean(account && debounced && !displayNameProblem(debounced) && !unchanged),
    },
  });
  let state: NameCheck = "idle";
  if (!name) state = "idle";
  else if (problem) state = "invalid";
  else if (unchanged) state = "unchanged";
  else if (!settled || q.isPending || q.isFetching) state = "checking";
  else if (q.data === false) state = "taken";
  else if (q.data === true) state = "available";
  else state = "checking";
  return { state, problem };
}

/**
 * Display-name input with the contract's rules checked as you type and availability checked
 * 300 ms after you stop (ADR 0029). Names are public on-chain: never ask for a real name.
 */
export function DisplayNameField({
  id = "display-name",
  value,
  onChange,
  check,
  label,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  check: { state: NameCheck; problem: string | null };
  label?: string;
}) {
  const { t } = useT();
  const { state, problem } = check;
  // Re-check here so the rule text follows a language switch.
  const note =
    state === "invalid"
      ? (displayNameProblem(value) ?? problem)
      : state === "taken"
        ? t("membership.nameTaken")
        : state === "available"
          ? t("membership.nameFree")
          : state === "checking"
            ? t("membership.nameChecking")
            : state === "unchanged"
              ? t("membership.nameUnchanged")
              : t("membership.nameHint");
  const bad = state === "invalid" || state === "taken";
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-[14px] font-medium">
        {label ?? t("membership.nameLabel")}
      </label>
      <div className="relative">
        <input
          id={id}
          className={cn(inputCls, "pr-10", bad && "border-bad focus:border-bad focus:ring-bad/15")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="NightOwl"
          maxLength={NAME_MAX + 8}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={bad}
          aria-describedby={`${id}-note`}
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {state === "checking" ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden />
          ) : state === "available" ? (
            <Check className="size-4 text-good" strokeWidth={1.5} aria-hidden />
          ) : bad ? (
            <X className="size-4 text-bad" strokeWidth={1.5} aria-hidden />
          ) : null}
        </span>
      </div>
      <p
        id={`${id}-note`}
        className={cn("text-[13px]", bad ? "text-bad" : "text-muted-foreground")}
        role={bad ? "alert" : undefined}
        aria-live="polite"
      >
        {note}
      </p>
    </div>
  );
}
