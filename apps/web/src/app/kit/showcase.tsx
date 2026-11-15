"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, Plus, RefreshCw, Send, ThumbsUp } from "lucide-react";

import {
  AnimatedIcon,
  Button,
  ErrorBoundary,
  InlineAlert,
  StateView,
  TxTracker,
  type ButtonState,
  type IconAnimation,
  type TxStatus,
} from "@/components/kit";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Avatar,
  CircleCover,
  EMPTY_VARIANTS,
  EmptyArt,
  PIECES,
  PIECE_NAMES,
} from "@/components/art";
import { Skeleton } from "@/components/ui/skeleton";
import { messages } from "@/lib/messages";
import { safeCall } from "@/lib/safe-call";
import { notify } from "@/lib/toast";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function KitShowcase() {
  return (
    <main className="mx-auto max-w-[1080px] px-[22px] py-16 sm:px-10 sm:py-24">
      <header className="space-y-4">
        <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
          Internal · not indexed
        </p>
        <h1 className="font-display text-[clamp(40px,5vw,60px)] leading-[1.02] tracking-tight">
          Interaction kit
        </h1>
        <p className="max-w-[60ch] text-[16px] leading-relaxed text-muted-foreground">
          Every feedback component in every state (ADR 0026, docs/ui.md §8–12). Turn on reduced
          motion in your OS to check that state changes still show without movement.
        </p>
      </header>

      <div className="mt-20 space-y-24">
        <ButtonsSection />
        <IconsSection />
        <StatesSection />
        <TrackerSection />
        <BoundarySection />
        <FeedbackSection />
        <LayersSection />
        <ArtSection />
      </div>
    </main>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-8">
      <div className="space-y-2 border-b border-border pb-5">
        <h2 className="font-display text-[34px] leading-tight tracking-tight">{title}</h2>
        {note && <p className="max-w-[62ch] text-[15px] text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Card({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5 rounded-[14px] border border-border bg-card p-7 sm:p-8">
      {label && <p className="font-mono text-[12px] text-muted-foreground">{label}</p>}
      {children}
    </div>
  );
}

function ButtonsSection() {
  const [controlled, setControlled] = React.useState<ButtonState>("idle");
  return (
    <Section
      title="Buttons"
      note="Press scales to 0.97; working swaps the icon for a spinner and changes the label; done draws a check; failed shows a cross and a short shake. Width never changes."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card label="onAction resolves after 1.5 s">
          <div className="flex flex-wrap gap-4">
            <Button
              icon={Send}
              iconAnimation="nudge"
              workingLabel="Paying…"
              doneLabel="Paid"
              onAction={() => wait(1500)}
              onSuccess={() => notify.paid("December", "0.50")}
            >
              Pay 0.50 AVAX
            </Button>
            <Button
              variant="secondary"
              icon={ThumbsUp}
              iconAnimation="lift"
              workingLabel="Sending vote…"
              onAction={() => wait(1200)}
              onSuccess={() => notify.voted(8, 12)}
            >
              Vote yes
            </Button>
          </div>
        </Card>
        <Card label="onAction rejects after 1.2 s">
          <div className="flex flex-wrap gap-4">
            <Button
              icon={Send}
              iconAnimation="nudge"
              workingLabel="Paying…"
              onAction={async () => {
                await wait(1200);
                throw Object.assign(new Error("User rejected the request."), { code: 4001 });
              }}
              onError={(e) => notify.error(e)}
            >
              Pay (will fail)
            </Button>
            <Button
              variant="danger"
              workingLabel="Requesting exit…"
              onAction={async () => {
                await wait(1000);
                throw new Error("boom");
              }}
              onError={(e) => notify.error(e)}
            >
              Request exit
            </Button>
          </div>
        </Card>
        <Card label="disabled with a reason (hover or focus)">
          <div className="flex flex-wrap gap-4">
            <Button icon={Send} disabled disabledReason="You've already paid this month.">
              Pay 0.50 AVAX
            </Button>
            <Button variant="secondary" disabled disabledReason="This vote has already ended.">
              Vote
            </Button>
          </div>
        </Card>
        <Card label="controlled state">
          <div className="flex flex-wrap items-center gap-4">
            <Button
              icon={Send}
              state={controlled}
              workingLabel="Paying…"
              doneLabel="Paid"
              failedLabel="Didn't go through"
            >
              Pay 0.50 AVAX
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["idle", "working", "done", "failed"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={controlled === s ? "primary" : "ghost"}
                onClick={() => setControlled(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </Card>
        <Card label="variants and sizes">
          <div className="flex flex-wrap items-center gap-4">
            <Button size="sm">Small</Button>
            <Button>Primary</Button>
            <Button size="lg">Large</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost" icon={Plus}>
              Ghost
            </Button>
            <Button variant="danger">Danger</Button>
          </div>
        </Card>
      </div>
    </Section>
  );
}

function IconsSection() {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const items: Array<{ icon: typeof Send; animation: IconAnimation; label: string }> = [
    { icon: Send, animation: "nudge", label: "nudge" },
    { icon: Check, animation: "draw", label: "draw" },
    { icon: RefreshCw, animation: "spin", label: "spin" },
    { icon: ThumbsUp, animation: "lift", label: "lift" },
  ];
  return (
    <Section title="Animated icons" note="Click an icon. 150–300 ms, ease-out, never looping.">
      <Card>
        <div className="flex flex-wrap items-center gap-10">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-3">
              <span className="inline-flex size-12 cursor-pointer items-center justify-center rounded-full border border-border">
                <AnimatedIcon icon={item.icon} animation={item.animation} playOnClick size={20} />
              </span>
              <span className="font-mono text-[12px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex size-12 cursor-pointer items-center justify-center rounded-full border border-border"
            >
              <AnimatedIcon icon={ChevronDown} animation="rotate" active={open} size={20} />
              <span className="sr-only">Toggle</span>
            </button>
            <span className="font-mono text-[12px] text-muted-foreground">rotate</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setCopied(true);
                notify.copied();
                setTimeout(() => setCopied(false), 1200);
              }}
              className="inline-flex size-12 cursor-pointer items-center justify-center rounded-full border border-border"
            >
              {copied ? (
                <AnimatedIcon icon={Check} size={20} className="text-good" />
              ) : (
                <AnimatedIcon icon={Copy} size={20} />
              )}
              <span className="sr-only">Copy address</span>
            </button>
            <span className="font-mono text-[12px] text-muted-foreground">copy, then check</span>
          </div>
        </div>
      </Card>
    </Section>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4 rounded-[14px] border border-border bg-card p-7">
      <Skeleton className="h-5 w-40" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function SampleContent() {
  return (
    <div className="rounded-[14px] border border-border bg-card p-7">
      <p className="text-[13px] text-muted-foreground">Circle value</p>
      <p className="tabular mt-2 font-display text-[44px] leading-none">42.18 AVAX</p>
    </div>
  );
}

function StatesSection() {
  return (
    <Section
      title="StateView: the eight states"
      note="Every data component renders through StateView."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card label='state="loading"'>
          <StateView state="loading" skeleton={<ListSkeleton />} />
        </Card>
        <Card label='state="success"'>
          <StateView state="success">
            <SampleContent />
          </StateView>
        </Card>
        <Card label='state="empty"'>
          <StateView
            state="empty"
            message="No loans yet. When someone asks for one, the vote shows up here."
            action={{ label: "Ask for a loan", icon: Plus, onAction: () => wait(800) }}
          />
        </Card>
        <Card label='state="error"'>
          <StateView
            state="error"
            onRetry={() => wait(1000)}
            details="HttpRequestError · code 503 · indexer"
          />
        </Card>
        <Card label='state="failed"'>
          <StateView
            state="failed"
            message={messages.alreadyPaid("December")}
            hint="Nothing was sent except the network fee."
            onRetry={() => wait(800)}
            details="ContractFunctionRevertedError · AlreadyPaid()"
          />
        </Card>
        <Card label='state="stale"'>
          <StateView state="stale" savedAt={0} now={4 * 60_000} onRefresh={() => wait(900)}>
            <SampleContent />
          </StateView>
        </Card>
        <Card label='state="offline"'>
          <StateView state="offline">
            <SampleContent />
          </StateView>
        </Card>
        <Card label='state="access" reason="no-wallet"'>
          <StateView state="access" reason="no-wallet" onAction={() => wait(900)} />
        </Card>
        <Card label='state="access" reason="wrong-network"'>
          <StateView state="access" reason="wrong-network" onAction={() => wait(900)} />
        </Card>
        <Card label='state="access" reason="not-member"'>
          <StateView state="access" reason="not-member" onAction={() => wait(500)} />
        </Card>
      </div>
    </Section>
  );
}

function TrackerSection() {
  const statuses: TxStatus[] = ["confirm", "sending", "confirmed", "failed"];
  return (
    <Section title="Transaction tracker">
      <div className="grid gap-6">
        {statuses.map((status) => (
          <Card key={status} label={`status="${status}"`}>
            <TxTracker
              status={status}
              failedMessage={status === "failed" ? messages.userRejected() : undefined}
              failedAt={status === "failed" ? "confirm" : undefined}
              explorerUrl={
                status === "sending" || status === "confirmed"
                  ? "https://testnet.snowtrace.io/"
                  : undefined
              }
            />
          </Card>
        ))}
      </div>
    </Section>
  );
}

function Thrower({ when }: { when: boolean }) {
  if (when) throw new Error("Chart data had an unexpected shape");
  return <SampleContent />;
}

function BoundarySection() {
  const [broken, setBroken] = React.useState(false);
  const [pageBroken, setPageBroken] = React.useState(false);
  return (
    <Section
      title="Error boundaries"
      note="A widget that throws shows its own card; the rest of the page keeps working. Retry re-renders it."
    >
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="sm" onClick={() => setBroken(true)}>
          Break the widget
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setPageBroken(true)}>
          Break the page section
        </Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <ErrorBoundary preset="widget" name="Contributions chart" onReset={() => setBroken(false)}>
          <Thrower when={broken} />
        </ErrorBoundary>
        <SampleContent />
      </div>
      <ErrorBoundary preset="page" onReset={() => setPageBroken(false)}>
        <Thrower when={pageBroken} />
      </ErrorBoundary>
    </Section>
  );
}

function FeedbackSection() {
  return (
    <Section
      title="Toasts and inline alerts"
      note="Toasts for results; inline alerts for things on this page that need attention."
    >
      <Card label="toasts (errors stay until dismissed)">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" size="sm" onClick={() => notify.paid("December", "0.50")}>
            Success
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => notify.info("The rule change takes effect in 3 days.")}
          >
            Info
          </Button>
          <Button variant="secondary" size="sm" onClick={() => notify.error({ code: 4001 })}>
            Error: cancelled
          </Button>
          <Button
            variant="secondary"
            size="sm"
            workingLabel="Calling…"
            onAction={async () => {
              const result = await safeCall(() => new Promise<never>(() => {}), {
                timeoutMs: 600,
                backoffMs: 200,
              });
              if (!result.ok) notify.error(result.error);
            }}
          >
            safeCall timeout
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void Promise.reject(new Error("fetch failed"));
            }}
          >
            Unhandled rejection
          </Button>
        </div>
      </Card>
      <div className="space-y-4">
        <InlineAlert tone="info" title="A rule change is coming">
          The late fee goes up to 0.02 AVAX in 3 days. You can leave before then.
        </InlineAlert>
        <InlineAlert
          tone="warn"
          title="December is due in 2 days"
          action={
            <Button
              size="sm"
              icon={Send}
              iconAnimation="nudge"
              workingLabel="Paying…"
              onAction={() => wait(1200)}
            >
              Pay 0.50 AVAX
            </Button>
          }
        >
          Pay before 23:59 UTC on 10 Dec to avoid the late fee.
        </InlineAlert>
        <InlineAlert
          tone="bad"
          title="Wrong network"
          action={
            <Button
              size="sm"
              variant="secondary"
              workingLabel="Switching…"
              onAction={() => wait(800)}
            >
              Switch
            </Button>
          }
        >
          {messages.wrongNetwork()}
        </InlineAlert>
      </div>
    </Section>
  );
}

function LayersSection() {
  const layers = [
    ["base", "z-base", 0],
    ["sticky", "z-sticky", 10],
    ["dropdown", "z-dropdown", 20],
    ["overlay", "z-overlay", 30],
    ["dialog", "z-dialog", 40],
    ["toast", "z-toast", 50],
  ] as const;
  return (
    <Section title="Layers" note="One z-index scale for the whole app (docs/ui.md §12).">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {layers.map(([name, cls, value]) => (
          <div key={name} className="rounded-[14px] border border-border bg-card p-5">
            <p className="font-mono text-[12px] text-muted-foreground">.{cls}</p>
            <p className="mt-2 font-display text-[28px] leading-none">{value}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{name}</p>
          </div>
        ))}
      </div>
      <Card label="dialog (overlay 30, dialog 40) + toast (50) on top">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open payment dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pay December</DialogTitle>
              <DialogDescription>
                0.50 AVAX goes from your wallet to the circle vault, plus about 0.02 AVAX network
                fee. This can&apos;t be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2 gap-3">
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button
                icon={Send}
                iconAnimation="nudge"
                workingLabel="Paying…"
                doneLabel="Paid"
                onAction={() => wait(1200)}
                onSuccess={() => notify.paid("December", "0.50")}
              >
                Pay 0.50 AVAX
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    </Section>
  );
}

/** Deterministic sample addresses for the art showcase. */
const SAMPLE_ADDRESSES = [
  "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be",
  "0x91a2c4e7f00b9d8a6e3c1b2f4d5e6a7b8c9d7be0",
  "0x07b1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7c44d",
  "0xa1c2e3f4b5d6c7e8f9a0b1c2d3e4f5a6b7c8d9e0",
  "0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f",
  "0xc0ffee254729296a45a3885639ac7e10f9d54979",
  "0x1234567890abcdef1234567890abcdef12345678",
  "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
] as const;

function ArtSection() {
  return (
    <Section
      title="Cut-paper art"
      note="Placeholder pieces until the illustrator delivers (ADR 0025). Art palette only; used on the hero, circle covers, empty states and avatars. Never in tables of numbers, forms or money decisions."
    >
      <Card label="pieces (100 × 100 box each)">
        <div className="grid grid-cols-4 gap-6 sm:grid-cols-8">
          {PIECE_NAMES.map((name) => {
            const Piece = PIECES[name];
            return (
              <figure key={name} className="space-y-2 text-center">
                <svg viewBox="0 0 100 100" className="mx-auto size-16" aria-hidden>
                  <Piece />
                </svg>
                <figcaption className="font-mono text-[12px] text-muted-foreground">
                  {name}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </Card>
      <Card label="Avatar: picked from the wallet address, same on every device">
        <div className="flex flex-wrap gap-5">
          {SAMPLE_ADDRESSES.map((a) => (
            <Avatar key={a} address={a} size={40} label={`Avatar for ${a.slice(0, 6)}`} />
          ))}
        </div>
      </Card>
      <div className="grid gap-5 sm:grid-cols-2">
        {SAMPLE_ADDRESSES.slice(0, 4).map((a) => (
          <div key={a} className="h-[120px] overflow-hidden rounded-[14px] border border-border">
            <CircleCover address={a} name={`Circle ${a.slice(0, 6)}`} />
          </div>
        ))}
      </div>
      <Card label="EmptyArt variants">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {EMPTY_VARIANTS.map((v) => (
            <figure key={v} className="space-y-2">
              <EmptyArt variant={v} />
              <figcaption className="font-mono text-[12px] text-muted-foreground">{v}</figcaption>
            </figure>
          ))}
        </div>
      </Card>
    </Section>
  );
}
