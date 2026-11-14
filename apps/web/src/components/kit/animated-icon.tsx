"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { motion, useAnimate, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Small interaction animations for lucide icons (docs/ui.md §9).
 * 150–300 ms, ease-out, never looping. With reduced motion nothing moves.
 *
 * - nudge:  Send on Pay (slides right and back)
 * - draw:   Check draws its stroke
 * - spin:   RefreshCw on Retry (one turn)
 * - lift:   Vote / ThumbsUp on Vote (lifts and settles)
 * - rotate: ChevronDown on open (follows the `active` prop, 0 -> 180 deg)
 */
export type IconAnimation = "nudge" | "draw" | "spin" | "lift" | "rotate" | "none";

export interface AnimatedIconProps {
  icon: LucideIcon;
  animation?: IconAnimation;
  /** Change this value (e.g. a press counter) to play the animation. */
  trigger?: unknown;
  /** Play when the icon itself is clicked. */
  playOnClick?: boolean;
  /** For `rotate`: open (true) or closed (false). */
  active?: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Accessible label; without it the icon is decorative (aria-hidden). */
  label?: string;
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const KEYFRAMES = {
  nudge: { keyframes: { x: [0, 4, 0] }, duration: 0.26 },
  lift: { keyframes: { y: [0, -3, 0] }, duration: 0.24 },
  spin: { keyframes: { rotate: [0, 360] }, duration: 0.3 },
} as const;

export function AnimatedIcon({
  icon: Icon,
  animation = "none",
  trigger,
  playOnClick = false,
  active = false,
  size = 16,
  strokeWidth = 1.5,
  className,
  label,
}: AnimatedIconProps) {
  const reduce = useReducedMotion() ?? false;
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const previousTrigger = React.useRef(trigger);

  const play = React.useCallback(() => {
    if (reduce || !scope.current) return;
    if (animation === "nudge" || animation === "lift" || animation === "spin") {
      const { keyframes, duration } = KEYFRAMES[animation];
      animate(scope.current, keyframes, { duration, ease: EASE_OUT });
    } else if (animation === "draw") {
      const strokes = scope.current.querySelectorAll("path, line, polyline, circle, rect");
      if (strokes.length > 0) {
        animate(strokes, { pathLength: [0, 1] }, { duration: 0.3, ease: EASE_OUT });
      }
    }
  }, [reduce, animation, animate, scope]);

  // A change of `trigger` plays the animation once (not on mount).
  React.useEffect(() => {
    if (Object.is(previousTrigger.current, trigger)) return;
    previousTrigger.current = trigger;
    play();
  }, [trigger, play]);

  const rotate = animation === "rotate" && active ? 180 : 0;

  return (
    <motion.span
      ref={scope}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      animate={animation === "rotate" ? { rotate } : undefined}
      transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
      onClick={playOnClick ? play : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-animation={animation}
    >
      <Icon size={size} strokeWidth={strokeWidth} aria-hidden />
    </motion.span>
  );
}

/** A check mark that draws itself in (Button "done" state). Static with reduced motion. */
export function DrawCheck({
  size = 16,
  strokeWidth = 1.75,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      data-testid="draw-check"
    >
      <motion.path
        d="M20 6 9 17l-5-5"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.35, ease: EASE_OUT }}
      />
    </svg>
  );
}
