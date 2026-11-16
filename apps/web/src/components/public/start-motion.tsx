"use client";

import { useEffect } from "react";

/**
 * Traces each step drawing once as it scrolls into view (ADR 0054). Does nothing with reduced
 * motion or without IntersectionObserver, so the page stays the finished static version.
 */
export function StartMotion({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root || typeof IntersectionObserver === "undefined") return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = false;
    }
    if (reduce) return;

    const arts = Array.from(root.querySelectorAll<SVGElement>(".start-step-art"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-seen", "");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.35 },
    );
    // Drawings already on screen stay drawn; only the ones below the fold wait to trace.
    const vh = window.innerHeight;
    for (const a of arts) {
      if (a.getBoundingClientRect().top < vh) a.setAttribute("data-seen", "");
      else io.observe(a);
    }
    root.setAttribute("data-start-motion", "on");
    return () => {
      io.disconnect();
      root.removeAttribute("data-start-motion");
    };
  }, [rootId]);
  return null;
}
