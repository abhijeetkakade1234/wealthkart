"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Toaster as Sonner } from "sonner";

/**
 * The single toast region (docs/ui.md §12). Mounted once in the root layout.
 * Bottom-right on desktop, top-center on phones; sits on the `toast` z-index layer.
 */
const MOBILE_QUERY = "(max-width: 639px)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => (window.matchMedia ? window.matchMedia(MOBILE_QUERY).matches : false),
    () => false,
  );
}

export function Toaster() {
  const isMobile = useIsMobile();
  return (
    <Sonner
      position={isMobile ? "top-center" : "bottom-right"}
      visibleToasts={4}
      gap={10}
      offset={24}
      mobileOffset={16}
      style={{ zIndex: "var(--z-toast)" } as React.CSSProperties}
      icons={{
        success: <CircleCheck size={18} strokeWidth={1.5} className="text-good" />,
        error: <CircleAlert size={18} strokeWidth={1.5} className="text-bad" />,
        info: <Info size={18} strokeWidth={1.5} className="text-brand" />,
        warning: <TriangleAlert size={18} strokeWidth={1.5} className="text-warn" />,
        loading: (
          <LoaderCircle
            size={18}
            strokeWidth={1.5}
            className="animate-spin text-muted-foreground"
          />
        ),
      }}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "!rounded-[14px] !border !border-border !bg-card !px-5 !py-4 !text-foreground !shadow-[0_1px_2px_rgba(20,20,25,0.04),0_16px_32px_-24px_rgba(20,20,25,0.25)] !font-sans !gap-3",
          title: "!text-[14.5px] !leading-relaxed !font-medium",
          description: "!text-[13.5px] !text-muted-foreground",
          closeButton: "!border-border !bg-card !text-muted-foreground hover:!text-foreground",
          actionButton: "!rounded-full !bg-primary !text-primary-foreground !font-semibold",
        },
      }}
    />
  );
}
