"use client";

import * as React from "react";

import { toFriendlyError } from "@/lib/messages";
import { notify } from "@/lib/toast";

/**
 * Last line of defence (docs/ui.md §11): an unhandled promise rejection or a
 * stray script error shows a friendly toast instead of a white screen.
 * Mounted once in the root layout. Renders nothing.
 */
export function GlobalErrorHandlers() {
  React.useEffect(() => {
    const show = (raw: unknown) => {
      const friendly = toFriendlyError(raw);
      // Same id per error kind: repeats replace the toast instead of stacking.
      notify.error(friendly, { id: `global-${friendly.code}` });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      console.error("[unhandledrejection]", event.reason);
      event.preventDefault();
      show(event.reason);
    };

    const onError = (event: ErrorEvent) => {
      // Ignore failed <img>/<script> loads and the harmless ResizeObserver warning.
      if (!event.message && !event.error) return;
      if (event.message?.includes("ResizeObserver loop")) return;
      console.error("[error]", event.error ?? event.message);
      show(event.error ?? event.message);
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
