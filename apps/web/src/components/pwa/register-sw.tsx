"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js` in production builds only, so dev never serves stale code.
 * Failure is silent: the app works the same without it, just not offline.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
