"use client";

import { shortAddress } from "@wealthkart/sdk";
import { ArrowLeftRight, Copy, LogOut, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/kit";
import { useT } from "@/i18n/react";
import { CORE_DOWNLOAD_URL } from "@/lib/wagmi";
import { notify } from "@/lib/toast";

import { useCoreWallet } from "./use-core-wallet";

/** Top-bar wallet control: connect Core, switch network, or show the connected address. */
export function ConnectButton() {
  const w = useCoreWallet();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (w.status === "no-core") {
    return (
      <a
        href={CORE_DOWNLOAD_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-secondary"
      >
        <Wallet className="size-4" aria-hidden />
        {t("wallet.getCore")}
      </a>
    );
  }

  if (w.status === "disconnected" || w.status === "connecting") {
    return (
      <Button
        size="sm"
        icon={Wallet}
        workingLabel={t("wallet.connecting")}
        onAction={w.connect}
        onError={(e) => notify.error(e)}
        state={w.status === "connecting" ? "working" : undefined}
      >
        {t("wallet.connectCore")}
      </Button>
    );
  }

  if (w.status === "wrong-network") {
    return (
      <Button
        size="sm"
        variant="secondary"
        icon={ArrowLeftRight}
        workingLabel={t("wallet.switching")}
        onAction={w.switchToTarget}
        onError={(e) => notify.error(e)}
      >
        {t("wallet.switchTo", { network: w.targetChain.name })}
      </Button>
    );
  }

  const address = w.address ?? "";
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 font-mono text-[12.5px] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="size-2 rounded-full bg-good" aria-hidden />
        {shortAddress(address)}
      </button>
      {open && (
        <div
          role="menu"
          className="z-dropdown absolute right-0 mt-2 w-52 rounded-[14px] border border-border bg-popover p-1.5 shadow-[0_12px_32px_-16px_rgba(20,20,25,.25)]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm hover:bg-secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                notify.copied();
              } catch {
                notify.info(address);
              }
              setOpen(false);
            }}
          >
            <Copy className="size-4 text-muted-foreground" aria-hidden />
            {t("wallet.copyAddress")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm hover:bg-secondary"
            onClick={() => {
              w.disconnect();
              setOpen(false);
            }}
          >
            <LogOut className="size-4 text-muted-foreground" aria-hidden />
            {t("wallet.disconnect")}
          </button>
        </div>
      )}
    </div>
  );
}
