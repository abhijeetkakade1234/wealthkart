"use client";

import { circleVaultAbi, shortAddress } from "@wealthkart/sdk";
import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Address } from "viem";
import { useReadContract } from "wagmi";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { useMyCircles } from "@/lib/circle";

/** Circle sub-pages that make sense for any circle; switching keeps you on the same one. */
const CIRCLE_PAGES = ["/app/circle/pay/", "/app/circle/"];

/** Where to send the user when they pick another circle from the switcher. */
export function switchHref(pathname: string, target: Address): string {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const page = CIRCLE_PAGES.find((c) => p.startsWith(c)) ?? "/app/circle/";
  return `${page}?id=${target}`;
}

/**
 * Top-bar dropdown: shows the open circle by name and lists the wallet's first page of
 * circles. More than a page links to the portfolio, which paginates (ADR 0023).
 */
export function CircleSwitcher({ circleId }: { circleId: Address | null }) {
  const pathname = usePathname();
  const { address } = useCoreWallet();
  const mine = useMyCircles(1);
  const openName = useReadContract({
    abi: circleVaultAbi,
    address: circleId ?? undefined,
    functionName: "name",
    query: { enabled: Boolean(circleId) },
  });

  if (!address) return null;

  const label = circleId
    ? openName.isPending
      ? null
      : openName.isSuccess
        ? openName.data
        : shortAddress(circleId)
    : "Pick a circle";
  const hasMore = mine.total !== undefined && mine.total > mine.circles.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hidden h-9 max-w-[220px] items-center gap-2 rounded-full border border-border px-3.5 text-[13px] text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
        aria-label="Switch circle"
      >
        {label === null ? (
          <Skeleton className="h-3.5 w-24" />
        ) : (
          <span className="truncate">{label}</span>
        )}
        <ChevronsUpDown
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuLabel className="text-[12px] font-normal text-muted-foreground">
          Your circles
        </DropdownMenuLabel>
        {mine.isPending ? (
          <div className="space-y-2 px-2 py-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : mine.isError ? (
          <p className="px-2 py-2 text-[13px] text-muted-foreground">
            We couldn&apos;t load your circles right now.
          </p>
        ) : mine.circles.length === 0 ? (
          <p className="px-2 py-2 text-[13px] text-muted-foreground">
            You&apos;re not in a circle yet.
          </p>
        ) : (
          mine.circles.map((c) => (
            <DropdownMenuItem key={c.address} asChild>
              <Link href={switchHref(pathname, c.address)} className="flex items-center gap-2">
                <span className="truncate">{c.name}</span>
                {circleId && c.address.toLowerCase() === circleId.toLowerCase() ? (
                  <Check
                    className="ml-auto size-4 text-brand"
                    strokeWidth={1.5}
                    aria-label="Open now"
                  />
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        {hasMore ? (
          <DropdownMenuItem asChild>
            <Link href="/app/" className="flex items-center gap-2">
              <LayoutGrid className="size-4" strokeWidth={1.5} aria-hidden />
              See all {mine.total} circles
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/app/new/" className="flex items-center gap-2">
            <Plus className="size-4" strokeWidth={1.5} aria-hidden />
            Start a circle
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
