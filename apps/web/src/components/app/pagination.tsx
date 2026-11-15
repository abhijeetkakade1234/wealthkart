"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Reads `?page=` (or another param, for a second list on the same page), 1-based.
 * Garbage or out-of-range values fall back safely (S-WEB-15).
 */
export function usePageParam(param = "page"): number {
  const raw = useSearchParams().get(param);
  const n = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Page numbers with ellipses: 1 … 4 5 6 … 20 */
export function pageWindow(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | "gap"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push("gap");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}

/**
 * URL-driven pagination (docs/ui.md §4): page lives in `?page=`, so refresh, back and
 * shared links keep the view. Clamps to the last page when data shrinks.
 */
export function Pagination({
  page,
  pageSize,
  total,
  noun = "items",
  param = "page",
}: {
  page: number;
  pageSize: number;
  total: number;
  noun?: string;
  /** URL param this list pages with; set it when a page has two paginated lists. */
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);

  if (total === 0) return null;

  const go = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete(param);
    else next.set(param, String(p));
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const btn =
    "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] tabular disabled:text-faint";

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-6 py-4 text-[13px] text-muted-foreground"
    >
      <span>
        Showing {from}–{to} of {total} {noun}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(btn, "hover:bg-secondary")}
          disabled={current <= 1}
          onClick={() => go(current - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        {pageWindow(current, pages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-faint">
              …
            </span>
          ) : (
            <button
              type="button"
              key={p}
              onClick={() => go(p)}
              aria-current={p === current ? "page" : undefined}
              className={cn(
                btn,
                p === current
                  ? "bg-foreground text-background"
                  : "text-foreground hover:bg-secondary",
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className={cn(btn, "hover:bg-secondary")}
          disabled={current >= pages}
          onClick={() => go(current + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
