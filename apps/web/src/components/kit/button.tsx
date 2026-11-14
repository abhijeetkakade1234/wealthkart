"use client";

import * as React from "react";
import { LoaderCircle, X, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { AnimatedIcon, DrawCheck, type IconAnimation } from "./animated-icon";

/**
 * The app button (docs/ui.md §8, ADR 0026).
 *
 * idle -> pressed (scale 0.97, ~120 ms) -> working (spinner, `workingLabel`, disabled)
 *      -> done (check draws in, ~1 s) | failed (cross + short shake) -> idle
 *
 * Uncontrolled: pass an async `onAction`; the button drives its own states and
 * ignores clicks while busy, so an action can never be submitted twice.
 * Controlled: pass `state` and drive it yourself (e.g. from a transaction hook).
 *
 * All labels are stacked in one grid cell so the width never jumps between states.
 */
export type ButtonState = "idle" | "working" | "done" | "failed";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type NativeButtonProps = Omit<
  React.ComponentProps<"button">,
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onDragEnter"
  | "onDragLeave"
  | "onDragOver"
  | "onDrop"
  | "children"
>;

export interface KitButtonProps extends NativeButtonProps {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  /** Leading lucide icon. */
  icon?: LucideIcon;
  /** Micro-animation the icon plays on press. */
  iconAnimation?: IconAnimation;
  /** Label while working, e.g. "Paying…". Defaults to the idle label. */
  workingLabel?: React.ReactNode;
  /** Label after success. Defaults to the idle label. */
  doneLabel?: React.ReactNode;
  /** Label after failure. Defaults to the idle label. */
  failedLabel?: React.ReactNode;
  /** Async action; the button shows working until it settles. A rejection shows "failed". */
  onAction?: () => unknown;
  onSuccess?: (result: unknown) => void;
  /** Receives the raw error so the caller can show a friendly toast. Never rethrown. */
  onError?: (error: unknown) => void;
  /** Controlled state. When set, `onAction` still runs but the parent owns the state. */
  state?: ButtonState;
  /** Why the button is disabled; shown as a tooltip ("You've already paid this month"). */
  disabledReason?: string;
  /** How long done/failed feedback stays before returning to idle. Default 1000 ms. */
  feedbackMs?: number;
}

const VARIANT_MAP: Record<Variant, "default" | "outline" | "ghost" | "destructive"> = {
  primary: "default",
  secondary: "outline",
  ghost: "ghost",
  danger: "destructive",
};

const SIZE_MAP: Record<Size, "sm" | "default" | "lg"> = { sm: "sm", md: "default", lg: "lg" };

export const Button = React.forwardRef<HTMLButtonElement, KitButtonProps>(function Button(
  {
    children,
    variant = "primary",
    size = "md",
    icon,
    iconAnimation = "none",
    workingLabel,
    doneLabel,
    failedLabel,
    onAction,
    onSuccess,
    onError,
    state: controlledState,
    disabled = false,
    disabledReason,
    feedbackMs = 1000,
    onClick,
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  const reduce = useReducedMotion() ?? false;
  const [internalState, setInternalState] = React.useState<ButtonState>("idle");
  const [presses, setPresses] = React.useState(0);
  const busy = React.useRef(false);
  const mounted = React.useRef(true);
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reasonId = React.useId();

  const state = controlledState ?? internalState;

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(resetTimer.current);
    };
  }, []);

  const settle = React.useCallback(
    (next: "done" | "failed") => {
      if (!mounted.current) return;
      setInternalState(next);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        busy.current = false;
        if (mounted.current) setInternalState("idle");
      }, feedbackMs);
    },
    [feedbackMs],
  );

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    // Ref guard: blocks a second click even before React re-renders the disabled state.
    if (busy.current || state !== "idle" || disabled) {
      event.preventDefault();
      return;
    }
    setPresses((n) => n + 1);
    onClick?.(event);
    if (!onAction || event.defaultPrevented) return;

    busy.current = true;
    if (controlledState === undefined) setInternalState("working");
    try {
      const result = await onAction();
      onSuccess?.(result);
      if (controlledState === undefined) settle("done");
      else busy.current = false;
    } catch (error) {
      onError?.(error);
      if (controlledState === undefined) settle("failed");
      else busy.current = false;
    }
  };

  const isDisabled = disabled || state === "working";
  const iconSize = size === "sm" ? 15 : 16;
  const showIconSlot = Boolean(icon) || state !== "idle";

  const labels: Array<[ButtonState, React.ReactNode]> = [
    ["idle", children],
    ["working", workingLabel ?? children],
    ["done", doneLabel ?? children],
    ["failed", failedLabel ?? children],
  ];

  const button = (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={state === "working" || undefined}
      aria-describedby={disabled && disabledReason ? reasonId : undefined}
      data-state={state}
      className={cn(
        buttonVariants({ variant: VARIANT_MAP[variant], size: SIZE_MAP[size] }),
        state === "working" && "disabled:opacity-100 cursor-progress",
        state === "done" && variant !== "primary" && "text-good",
        state === "failed" && variant !== "primary" && variant !== "danger" && "text-bad",
        className,
      )}
      whileTap={reduce || isDisabled ? undefined : { scale: 0.97 }}
      animate={state === "failed" && !reduce ? { x: [0, -5, 5, -3, 3, 0] } : { x: 0 }}
      transition={{
        scale: { duration: 0.12, ease: "easeOut" },
        x: { duration: 0.36, ease: "easeOut" },
      }}
      onClick={handleClick}
      {...rest}
    >
      {showIconSlot && (
        <span
          className="relative inline-flex shrink-0 items-center justify-center"
          style={{ width: iconSize, height: iconSize }}
          aria-hidden
        >
          {state === "working" ? (
            <LoaderCircle
              size={iconSize}
              strokeWidth={1.75}
              className="animate-spin"
              data-testid="button-spinner"
            />
          ) : state === "done" ? (
            <DrawCheck size={iconSize} />
          ) : state === "failed" ? (
            <X size={iconSize} strokeWidth={1.75} data-testid="button-failed" />
          ) : icon ? (
            <AnimatedIcon icon={icon} animation={iconAnimation} trigger={presses} size={iconSize} />
          ) : null}
        </span>
      )}
      {/* Every label sits in the same grid cell: width = widest label, so no layout jump. */}
      <span className="inline-grid">
        {labels.map(([key, text]) => (
          <span
            key={key}
            className={cn("[grid-area:1/1] text-center", key !== state && "invisible")}
            aria-hidden={key !== state || undefined}
          >
            {text}
          </span>
        ))}
      </span>
    </motion.button>
  );

  if (disabled && disabledReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Disabled buttons get no pointer events, so the wrapper carries the tooltip. */}
            <span
              tabIndex={0}
              className="inline-flex rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-brand/35"
            >
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      </TooltipProvider>
    );
  }

  return button;
});
