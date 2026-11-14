"use client";

import {
  Activity,
  HandCoins,
  Home,
  Landmark,
  type LucideIcon,
  MoreHorizontal,
  Users,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ConnectButton } from "@/components/wallet/connect-button";
import { cn } from "@/lib/utils";

type NavItem = { label: string; href: string; icon: LucideIcon; needsCircle?: boolean };

const NAV: NavItem[] = [
  { label: "Home", href: "/app/", icon: Home },
  { label: "Pay", href: "/app/circle/pay/", icon: HandCoins, needsCircle: true },
  { label: "Loans", href: "/app/circle/loans/", icon: Landmark, needsCircle: true },
  { label: "Votes", href: "/app/circle/votes/", icon: Vote, needsCircle: true },
  { label: "Members", href: "/app/circle/members/", icon: Users, needsCircle: true },
  { label: "Activity", href: "/app/circle/activity/", icon: Activity, needsCircle: true },
];

/** Mobile bottom bar: the four most-used destinations plus More (docs/ui.md §3). */
const MOBILE_NAV = NAV.filter((n) => ["Home", "Pay", "Loans", "Votes"].includes(n.label));

const NEEDS_CIRCLE_HINT = "Open a circle first";

function isActive(pathname: string, href: string) {
  return href === "/app/" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(href);
}

/**
 * One layout for every app page (ADR 0023): sidebar on desktop, bottom bar on phones,
 * top bar with circle switcher, network and wallet. Generous whitespace (ADR 0025).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Circle context arrives with the circle pages; until then circle-only items are disabled.
  const hasCircle = false;

  return (
    <div className="min-h-dvh bg-background">
      <header className="z-sticky sticky top-0 border-b border-line-soft bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-[68px] max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/app/" className="font-display text-[22px] tracking-tight">
            WealthKart
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="hidden h-9 items-center rounded-full border border-border px-3.5 text-[12.5px] text-muted-foreground sm:inline-flex">
              No circle selected
            </span>
            <ConnectButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1320px]">
        <nav
          aria-label="Main"
          className="sticky top-[68px] hidden h-[calc(100dvh-68px)] w-[220px] shrink-0 flex-col gap-1.5 border-r border-line-soft px-4 py-10 md:flex"
        >
          {NAV.map((item) => {
            const disabled = item.needsCircle && !hasCircle;
            const active = isActive(pathname, item.href);
            const cls = cn(
              "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[14px] transition-colors",
              active ? "bg-brand-soft font-semibold text-brand" : "text-muted-foreground",
              disabled
                ? "cursor-not-allowed opacity-50"
                : "hover:bg-secondary hover:text-foreground",
            );
            return disabled ? (
              <span key={item.label} className={cls} title={NEEDS_CIRCLE_HINT} aria-disabled>
                <item.icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
                {item.label}
              </span>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className={cls}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1 px-4 pb-32 pt-10 sm:px-10 md:pb-24 md:pt-14">
          {children}
        </main>
      </div>

      <nav
        aria-label="Main"
        className="z-sticky fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {[...MOBILE_NAV, { label: "More", href: "/app/", icon: MoreHorizontal }].map((item) => {
          const disabled = "needsCircle" in item && item.needsCircle && !hasCircle;
          const active = item.label !== "More" && isActive(pathname, item.href);
          const cls = cn(
            "flex flex-col items-center gap-1 py-2.5 text-[11px]",
            active ? "font-semibold text-brand" : "text-faint",
            disabled && "opacity-50",
          );
          const content = (
            <>
              <item.icon className="size-5" strokeWidth={1.5} aria-hidden />
              {item.label}
            </>
          );
          return disabled ? (
            <span key={item.label} className={cls} aria-disabled title={NEEDS_CIRCLE_HINT}>
              {content}
            </span>
          ) : (
            <Link key={item.label} href={item.href} className={cls}>
              {content}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
