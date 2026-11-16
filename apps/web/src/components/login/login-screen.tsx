"use client";

import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Download,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/kit";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { notify } from "@/lib/toast";
import { CORE_DOWNLOAD_URL } from "@/lib/wagmi";

import { PaperCircle } from "./paper-circle";
import { safeNext } from "./safe-next";

/**
 * Sign-in: art on the left, one clear action on the right (ADR 0025 look, ADR 0026 states).
 * There is no account: connecting Core is the login (ADR 0003, 0004). Once the wallet is
 * ready we send the person back where they were going.
 */
export function LoginScreen() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const w = useCoreWallet();

  useEffect(() => {
    if (w.status === "ready") router.replace(next);
  }, [w.status, next, router]);

  return (
    // One screen, never scrolls: everything is sized to the viewport height (dvh).
    <div className="grid h-dvh overflow-hidden bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Left: the paper table. Hidden on phones, where the action comes first. */}
      <aside className="relative hidden min-h-0 overflow-hidden bg-[#f3eedf] lg:flex lg:flex-col lg:justify-between lg:gap-6 lg:px-16 lg:py-12">
        <Link href="/" className="font-display text-[24px] tracking-tight text-foreground">
          WealthKart
        </Link>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <PaperCircle className="h-full max-h-[520px] w-auto max-w-full" />
        </div>
        <div className="login-rise max-w-[440px]" style={{ animationDelay: "500ms" }}>
          <p className="font-display text-[40px] leading-[1.08] tracking-tight text-foreground">
            Save together.
            <br />
            Lend on trust.
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
            A private circle for friends who already trust each other. Everyone puts in a little
            each month, and the circle lends to whoever needs it, by vote.
          </p>
        </div>
      </aside>

      {/* Right: one job, sign in. */}
      <main className="flex min-h-0 flex-col overflow-hidden px-6 py-6 sm:px-12 sm:py-8 lg:px-20 lg:py-12">
        <div className="flex items-center justify-between">
          <BackButton />
          <Link href="/" className="font-display text-[22px] tracking-tight lg:hidden">
            WealthKart
          </Link>
        </div>

        <div className="login-rise mx-auto flex min-h-0 w-full max-w-[400px] flex-1 flex-col justify-center py-6">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
            <KeyRound className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <h1 className="mt-8 font-display text-[44px] leading-[1.05] tracking-tight">
            Sign in with Core
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
            There&apos;s no account and no password. Your Core wallet is your login, and we never
            ask for your name, email or phone number.
          </p>

          <div className="mt-10 grid gap-4 [@media(max-height:640px)]:mt-6">
            <SignInAction status={w.status} />
          </div>

          <Link
            href="/start/"
            className="group mt-6 inline-flex items-center gap-1.5 self-start text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
            data-testid="login-start-link"
          >
            New to wallets?
            <span className="font-medium text-brand underline-offset-4 group-hover:underline">
              Start here
            </span>
            <ArrowRight
              className="size-3.5 text-brand transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
              aria-hidden
            />
          </Link>

          {/* On very short screens the notes give way, so the page still never scrolls. */}
          <ul className="mt-10 grid gap-4 border-t border-line-soft pt-8 text-[13.5px] text-muted-foreground [@media(max-height:720px)]:hidden">
            <li className="flex gap-3">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-brand"
                strokeWidth={1.5}
                aria-hidden
              />
              WealthKart never holds your money or your keys. Every payment goes from your wallet to
              your circle&apos;s contract.
            </li>
            <li className="flex gap-3">
              <Wallet className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.5} aria-hidden />
              Lost wallets can&apos;t be recovered, so keep your Core recovery phrase safe.
            </li>
          </ul>
        </div>

        <footer className="mx-auto flex w-full max-w-[400px] flex-wrap gap-x-6 gap-y-2 text-[13px] text-faint">
          <Link href="/how-it-works/" className="hover:text-foreground">
            How it works
          </Link>
          <Link href="/security/" className="hover:text-foreground">
            Security
          </Link>
          <Link href="/faq/" className="hover:text-foreground">
            FAQ
          </Link>
          <span className="ml-auto">Test network only for now</span>
        </footer>
      </main>
    </div>
  );
}

/**
 * Back to wherever the person came from on this site; straight to the home page if they
 * opened the sign-in link directly or came from somewhere else.
 */
function BackButton() {
  const router = useRouter();
  function back() {
    const fromHere =
      typeof document !== "undefined" &&
      document.referrer.startsWith(window.location.origin) &&
      window.history.length > 1;
    if (fromHere) router.back();
    else router.push("/");
  }
  return (
    <button
      type="button"
      onClick={back}
      className="group -ml-2 inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-[14px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft
        className="size-4 transition-transform group-hover:-translate-x-0.5"
        strokeWidth={1.75}
        aria-hidden
      />
      Back
    </button>
  );
}

function SignInAction({ status }: { status: ReturnType<typeof useCoreWallet>["status"] }) {
  const w = useCoreWallet();

  if (status === "no-core") {
    return (
      <>
        <a
          href={CORE_DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center gap-2.5 rounded-[12px] bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-transform active:scale-[0.98]"
        >
          <Download className="size-4" strokeWidth={1.75} aria-hidden />
          Get Core wallet
        </a>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center gap-2 text-[13.5px] text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />
          I&apos;ve installed it, check again
        </button>
      </>
    );
  }

  if (status === "wrong-network") {
    return (
      <>
        <p className="text-[14px] text-muted-foreground">
          Your wallet is connected but on a different network.
        </p>
        <Button
          size="lg"
          icon={ArrowLeftRight}
          workingLabel="Switching…"
          onAction={w.switchToTarget}
          onError={(e) => notify.error(e)}
        >
          Switch to {w.targetChain.name}
        </Button>
      </>
    );
  }

  return (
    <Button
      size="lg"
      icon={Wallet}
      workingLabel={status === "ready" ? "Opening your circles…" : "Connecting…"}
      state={status === "connecting" || status === "ready" ? "working" : undefined}
      onAction={w.connect}
      onError={(e) => notify.error(e)}
    >
      Connect Core
    </Button>
  );
}
