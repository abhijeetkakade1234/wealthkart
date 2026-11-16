"use client";

import {
  Activity,
  HandCoins,
  Home,
  Landmark,
  type LucideIcon,
  MoreHorizontal,
  Settings,
  Users,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { CircleSwitcher } from "@/components/app/circle-switcher";
import { LanguageMenu } from "@/components/app/language-switcher";
import { ConnectButton } from "@/components/wallet/connect-button";
import { useT } from "@/i18n/react";
import type { PlainKey } from "@/i18n/types";
import { parseCircleId } from "@/lib/circle";
import { cn } from "@/lib/utils";

type NavItem = {
  /** Stable id; the visible label is `t(labelKey)`. */
  label: string;
  labelKey: PlainKey;
  href: string;
  icon: LucideIcon;
  needsCircle?: boolean;
  /** Not built yet: shown disabled with a hint. */
  soon?: boolean;
};

const NAV: NavItem[] = [
  { label: "Home", labelKey: "nav.home", href: "/app/", icon: Home },
  { label: "Circle", labelKey: "nav.circle", href: "/app/circle/", icon: Users, needsCircle: true },
  {
    label: "Pay",
    labelKey: "nav.pay",
    href: "/app/circle/pay/",
    icon: HandCoins,
    needsCircle: true,
  },
  {
    label: "Loans",
    labelKey: "nav.loans",
    href: "/app/circle/loans/",
    icon: Landmark,
    needsCircle: true,
  },
  {
    label: "Votes",
    labelKey: "nav.votes",
    href: "/app/circle/votes/",
    icon: Vote,
    needsCircle: true,
  },
  {
    label: "Activity",
    labelKey: "nav.activity",
    href: "/app/circle/activity/",
    icon: Activity,
    needsCircle: true,
  },
  { label: "Settings", labelKey: "nav.settings", href: "/app/settings/", icon: Settings },
];

/** Mobile bottom bar: four destinations plus More (docs/ui.md §3). */
const MOBILE_NAV: NavItem[] = [
  ...NAV.filter((n) => ["Home", "Pay", "Loans", "Votes"].includes(n.label)),
  { label: "More", labelKey: "nav.more", href: "/app/settings/", icon: MoreHorizontal },
];

function isActive(pathname: string, item: NavItem) {
  if (item.label === "More") return pathname.startsWith("/app/settings");
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (item.href === "/app/" || item.href === "/app/circle/") return p === item.href;
  return p.startsWith(item.href);
}

/**
 * One layout for every app page (ADR 0023): sidebar on desktop, bottom bar on phones,
 * top bar with the open circle, network and wallet. Generous whitespace (ADR 0025).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const circleId = parseCircleId(useSearchParams().get("id"));
  const { t } = useT();

  const hrefFor = (item: NavItem) =>
    item.needsCircle && circleId ? `${item.href}?id=${circleId}` : item.href;
  const hintFor = (item: NavItem) =>
    item.soon ? t("nav.soon") : item.needsCircle && !circleId ? t("nav.needsCircle") : undefined;

  return (
    <div className="min-h-dvh bg-background">
      <header className="z-sticky sticky top-0 border-b border-line-soft bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-[68px] max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/app/" className="font-display text-[22px] tracking-tight">
            WealthKart
          </Link>
          <div className="flex items-center gap-2.5">
            <CircleSwitcher circleId={circleId} />
            <LanguageMenu />
            <ConnectButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1320px]">
        <nav
          aria-label={t("nav.main")}
          className="sticky top-[68px] hidden h-[calc(100dvh-68px)] w-[220px] shrink-0 flex-col gap-1.5 border-r border-line-soft px-4 py-10 md:flex"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              href={hrefFor(item)}
              hint={hintFor(item)}
              active={isActive(pathname, item)}
              variant="side"
            />
          ))}
        </nav>

        <main className="min-w-0 flex-1 px-4 pb-32 pt-10 sm:px-10 md:pb-24 md:pt-14">
          {children}
        </main>
      </div>

      <nav
        aria-label={t("nav.main")}
        className="z-sticky fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {MOBILE_NAV.map((item) => (
          <NavLink
            key={item.label}
            item={item}
            href={hrefFor(item)}
            hint={hintFor(item)}
            active={isActive(pathname, item)}
            variant="bottom"
          />
        ))}
      </nav>
    </div>
  );
}

function NavLink({
  item,
  href,
  hint,
  active,
  variant,
}: {
  item: NavItem;
  href: string;
  hint: string | undefined;
  active: boolean;
  variant: "side" | "bottom";
}) {
  const { t } = useT();
  const disabled = hint !== undefined;
  const cls =
    variant === "side"
      ? cn(
          "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[14px] transition-colors",
          active ? "bg-brand-soft font-semibold text-brand" : "text-muted-foreground",
          disabled ? "cursor-not-allowed opacity-50" : "hover:bg-secondary hover:text-foreground",
        )
      : cn(
          "flex flex-col items-center gap-1 py-2.5 text-[11px]",
          active ? "font-semibold text-brand" : "text-faint",
          disabled && "opacity-50",
        );
  const content = (
    <>
      <item.icon
        className={variant === "side" ? "size-[18px]" : "size-5"}
        strokeWidth={1.5}
        aria-hidden
      />
      {t(item.labelKey)}
    </>
  );
  return disabled ? (
    <span className={cls} title={hint} aria-disabled>
      {content}
    </span>
  ) : (
    <Link href={href} className={cls} aria-current={active ? "page" : undefined}>
      {content}
    </Link>
  );
}
