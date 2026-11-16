"use client";

import { useEffect } from "react";

/**
 * Loads GSAP + ScrollTrigger after the page is idle and starts the landing motion
 * (ADR 0049). Lives only on `/`, and GSAP is a dynamic import, so neither the first paint
 * nor any `/app` bundle carries it. Reduced motion: nothing loads, the page stays still.
 * If the visitor turns reduced motion on later, the motion is reverted on the spot.
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing]");
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop: (() => void) | undefined;
    let cancelled = false;
    let idle: number | undefined;

    const start = async () => {
      const [{ gsap }, { ScrollTrigger }, { startLandingMotion }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("./motion"),
      ]);
      if (cancelled || reduce.matches || stop) return;
      gsap.registerPlugin(ScrollTrigger);
      stop = startLandingMotion(root, gsap, ScrollTrigger);
    };

    const schedule = () => {
      const run = () => void start().catch(() => undefined);
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(run, { timeout: 1200 });
      } else {
        idle = globalThis.setTimeout(run, 200) as unknown as number;
      }
    };

    const onChange = () => {
      if (reduce.matches) {
        stop?.();
        stop = undefined;
      } else if (!stop) {
        schedule();
      }
    };

    if (!reduce.matches) schedule();
    reduce.addEventListener("change", onChange);
    return () => {
      cancelled = true;
      if (idle !== undefined) {
        if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
        globalThis.clearTimeout(idle);
      }
      reduce.removeEventListener("change", onChange);
      stop?.();
    };
  }, []);

  return null;
}
