"use client";

import { circleVaultAbi, shortAddress } from "@wealthkart/sdk";
import { ArrowRight, Check, LogIn, Undo2, UserPlus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { type Address, isAddress } from "viem";
import { useReadContract } from "wagmi";

import { CircleNotFound } from "@/components/app/circle-not-found";
import { Deadline } from "@/components/app/deadline";
import { PageHeader } from "@/components/app/page-header";
import { CircleCover } from "@/components/art";
import { Button, InlineAlert, StateView, TxTracker } from "@/components/kit";
import { DisplayNameField, useNameCheck } from "@/components/membership/display-name-field";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { rich, useT } from "@/i18n/react";
import { fmt } from "@/lib/asset";
import { parseCircleId, useChainNow, useCircle, useJoinRequest } from "@/lib/circle";
import {
  ADMISSION_PASS_PCT,
  joinResultMessage,
  joinStatusName,
  quorumVotes,
  tallyLine,
} from "@/lib/membership";
import { notify } from "@/lib/toast";
import { useTx } from "@/lib/use-tx";
import { useBufferedWriteContract } from "@/lib/use-buffered-write";

export default function JoinPage() {
  return (
    <RequireWallet>
      <Suspense fallback={null}>
        <Join />
      </Suspense>
    </RequireWallet>
  );
}

/** Remembers the applicant's last request id so the result still shows after it closes. */
function useRememberedRequest(circle: Address | null, account: Address | undefined) {
  const key = circle && account ? `wk:join:${circle}:${account}`.toLowerCase() : null;
  const [id, setId] = useState<bigint | null>(null);
  useEffect(() => {
    if (!key) return;
    try {
      const raw = sessionStorage.getItem(key);
      setId(raw ? BigInt(raw) : null);
    } catch {
      setId(null);
    }
  }, [key]);
  const remember = (next: bigint | null) => {
    setId(next);
    if (!key) return;
    try {
      if (next) sessionStorage.setItem(key, String(next));
      else sessionStorage.removeItem(key);
    } catch {
      // Storage can be blocked; the page still works, it just forgets after a reload.
    }
  };
  return [id, remember] as const;
}

function Join() {
  const router = useRouter();
  const params = useSearchParams();
  const id = parseCircleId(params.get("id"));
  const byRaw = params.get("by");
  const by = byRaw && isAddress(byRaw) ? (byRaw as Address) : null;
  const { address } = useCoreWallet();
  const c = useCircle(id);
  const chainNow = useChainNow();
  const [remembered, remember] = useRememberedRequest(id, address);
  const { t } = useT();

  const openId = c.data?.openRequestId ?? 0n;
  useEffect(() => {
    if (openId > 0n && openId !== remembered) remember(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  if (!id || c.notFound) return <CircleNotFound notACircle={c.notACircle} />;
  if (c.isPending || !c.data) {
    return (
      <StateView
        state="loading"
        label={t("join.loadingCircle")}
        skeleton={
          <div className="grid max-w-[720px] gap-8">
            <Skeleton className="h-[150px] rounded-[14px]" />
            <Skeleton className="h-12 w-72 rounded-lg" />
            <Skeleton className="h-48 rounded-[14px]" />
          </div>
        }
      />
    );
  }
  if (c.isError) return <StateView state="error" onRetry={() => c.refetch()} />;

  const d = c.data;
  const refetch = () => void c.refetch();
  const inviteLive = d.founderInviteExpiry > 0 && chainNow <= d.founderInviteExpiry;
  const inviteExpired = d.founderInviteExpiry > 0 && !inviteLive;
  const trackedId = openId > 0n ? openId : remembered;

  let body: React.ReactNode;
  // Just voted in: show the result first ("You're in"), then the circle.
  if (d.isMember && trackedId) {
    body = (
      <RequestStatus
        circle={id}
        requestId={trackedId}
        quorumPct={d.quorumPct}
        chainNow={chainNow}
        onChanged={refetch}
        onAskAgain={() => {
          remember(null);
          refetch();
        }}
      />
    );
  } else if (d.isMember) {
    body = (
      <StateView
        state="empty"
        message={t("join.youreMember", { name: d.name })}
        action={{
          label: t("join.openCircle"),
          onAction: () => router.push(`/app/circle/?id=${id}`),
        }}
      />
    );
  } else if (inviteLive) {
    body = (
      <FounderInvite
        circle={id}
        expiresAt={d.founderInviteExpiry}
        chainNow={chainNow}
        onDone={refetch}
      />
    );
  } else if (trackedId) {
    body = (
      <RequestStatus
        circle={id}
        requestId={trackedId}
        quorumPct={d.quorumPct}
        chainNow={chainNow}
        onChanged={refetch}
        onAskAgain={() => {
          remember(null);
          refetch();
        }}
      />
    );
  } else {
    body = (
      <>
        {inviteExpired && <InlineAlert tone="warn">{t("join.inviteExpired")}</InlineAlert>}
        <RequestForm
          circle={id}
          me={address}
          by={by}
          full={d.maxMembers > 0 && Number(d.memberCount) >= d.maxMembers}
          tooMany={d.openRequestCount >= 20}
          onSent={(newId) => {
            if (newId) remember(newId);
            refetch();
          }}
        />
      </>
    );
  }

  return (
    <div className="max-w-[720px]">
      <div className="mb-10 h-[120px] overflow-hidden rounded-[14px] border border-line-soft sm:h-[150px]">
        <CircleCover address={id} name={d.name} />
      </div>
      <PageHeader
        title={d.name}
        subtitle={inviteLive ? t("join.subtitleFounder") : t("join.subtitleJoin")}
      />
      <CircleFacts d={d} />
      <div className="mt-14 grid gap-8">{body}</div>
    </div>
  );
}

function CircleFacts({ d }: { d: NonNullable<ReturnType<typeof useCircle>["data"]> }) {
  const { t } = useT();
  const hours = Math.round(d.votingWindow / 3600);
  const asset = d.asset;
  const voteWindow =
    hours >= 48
      ? t("join.windowDays", { count: Math.round(hours / 24) })
      : t("join.windowHours", { count: hours });
  const facts: Array<[string, string]> = [
    [t("join.factMoney"), asset.symbol === "USDT" ? t("join.moneyUsdt") : "AVAX"],
    [t("join.factEachMonth"), `${fmt(d.installment, asset)} ${asset.symbol}`],
    [t("join.factDue"), t("join.dueValue", { day: d.dueDay })],
    [
      t("join.factLateFees"),
      t("join.lateFeesValue", {
        fee1: fmt(d.fee1, asset),
        symbol: asset.symbol,
        day: d.dueDay,
        fee2: fmt(d.fee2, asset),
        day2: d.secondFeeDay,
      }),
    ],
    [
      t("join.factMembers"),
      d.maxMembers > 0
        ? t("join.membersOf", { count: String(d.memberCount), max: d.maxMembers })
        : String(d.memberCount),
    ],
    [
      t("join.factJoining"),
      t("join.joiningValue", { quorum: d.quorumPct, pass: ADMISSION_PASS_PCT, window: voteWindow }),
    ],
  ];
  return (
    <dl className="grid gap-x-10 gap-y-6 rounded-[14px] border border-border bg-card p-[26px] sm:grid-cols-2 sm:p-8">
      {facts.map(([k, v]) => (
        <div key={k} className="grid gap-1.5">
          <dt className="text-[12.5px] text-muted-foreground">{k}</dt>
          <dd className="text-[15px]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function FounderInvite({
  circle,
  expiresAt,
  chainNow,
  onDone,
}: {
  circle: Address;
  expiresAt: number;
  chainNow: number;
  onDone: () => void;
}) {
  const writeContractAsync = useBufferedWriteContract();
  const acceptTx = useTx();
  const declineTx = useTx();
  const busy = (x: { status: string }) => x.status === "confirm" || x.status === "sending";
  const { t } = useT();

  async function accept() {
    const receipt = await acceptTx.run(() =>
      writeContractAsync({ abi: circleVaultAbi, address: circle, functionName: "acceptInvite" }),
    );
    if (receipt) {
      notify.success(t("join.founderToast"));
      onDone();
    }
  }
  async function decline() {
    const receipt = await declineTx.run(() =>
      writeContractAsync({ abi: circleVaultAbi, address: circle, functionName: "declineInvite" }),
    );
    if (receipt) {
      notify.info(t("join.declinedToast"));
      onDone();
    }
  }

  return (
    <section className="grid gap-6">
      <p className="text-[15px] leading-relaxed">{t("join.founderBody")}</p>
      <Deadline deadline={expiresAt} chainNow={chainNow} prefix={t("join.inviteExpires")} />
      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          icon={Check}
          workingLabel={t("join.joining")}
          state={busy(acceptTx) ? "working" : undefined}
          onClick={accept}
        >
          {t("join.accept")}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          icon={X}
          workingLabel={t("join.declining")}
          state={busy(declineTx) ? "working" : undefined}
          onClick={decline}
        >
          {t("join.decline")}
        </Button>
      </div>
      {acceptTx.status !== "idle" && <TxTracker {...trackerProps(acceptTx)} />}
      {declineTx.status !== "idle" && <TxTracker {...trackerProps(declineTx)} />}
    </section>
  );
}

function trackerProps(t: ReturnType<typeof useTx>) {
  return {
    status: t.status as Exclude<typeof t.status, "idle">,
    failedAt: t.failedAt,
    failedMessage: t.failedMessage,
    explorerUrl: t.explorerUrl,
  };
}

function RequestForm({
  circle,
  me,
  by,
  full,
  tooMany,
  onSent,
}: {
  circle: Address;
  me: Address | undefined;
  by: Address | null;
  full: boolean;
  tooMany: boolean;
  onSent: (id: bigint | null) => void;
}) {
  const [name, setName] = useState("");
  const { t } = useT();
  const check = useNameCheck(circle, me, name);
  const writeContractAsync = useBufferedWriteContract();
  const tx = useTx();
  const busy = tx.status === "confirm" || tx.status === "sending";

  // The inviter only counts if they're a member here; otherwise send no inviter.
  const inviter = useReadContract({
    abi: circleVaultAbi,
    address: circle,
    functionName: "isMember",
    args: by ? [by] : undefined,
    query: { enabled: Boolean(by) },
  });
  const inviterName = useReadContract({
    abi: circleVaultAbi,
    address: circle,
    functionName: "nameOf",
    args: by ? [by] : undefined,
    query: { enabled: Boolean(by) },
  });
  const validInviter = by && inviter.data === true ? by : null;

  async function send() {
    const receipt = await tx.run(() =>
      writeContractAsync({
        abi: circleVaultAbi,
        address: circle,
        functionName: "requestToJoin",
        args: [name, validInviter ?? "0x0000000000000000000000000000000000000000"],
      }),
    );
    if (receipt) {
      notify.success(t("join.sentToast"));
      onSent(null);
    }
  }

  if (full) {
    return <InlineAlert tone="warn">{t("join.full")}</InlineAlert>;
  }

  return (
    <section className="grid gap-8">
      <div className="grid gap-2">
        <h2 className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          {t("join.askToJoin")}
        </h2>
        <p className="text-[14.5px] leading-relaxed text-muted-foreground">
          {t("join.askBody", { pct: ADMISSION_PASS_PCT })}
        </p>
      </div>
      {validInviter && (
        <p className="text-[14px]">
          {rich(t("join.invitedBy", { name: inviterName.data || shortAddress(validInviter) }), {
            b: (c) => <strong className="font-semibold">{c}</strong>,
          })}
        </p>
      )}
      {tooMany && <InlineAlert tone="warn">{t("join.tooMany")}</InlineAlert>}
      <DisplayNameField value={name} onChange={setName} check={check} />
      <div>
        <Button
          size="lg"
          icon={UserPlus}
          workingLabel={t("join.sending")}
          state={busy ? "working" : undefined}
          onClick={send}
          disabled={check.state !== "available" || tooMany}
          disabledReason={tooMany ? t("join.tooManyReason") : t("membership.pickFreeFirst")}
        >
          {t("join.askToJoin")}
        </Button>
      </div>
      {tx.status !== "idle" && <TxTracker {...trackerProps(tx)} />}
    </section>
  );
}

function RequestStatus({
  circle,
  requestId,
  quorumPct,
  chainNow,
  onChanged,
  onAskAgain,
}: {
  circle: Address;
  requestId: bigint;
  quorumPct: number;
  chainNow: number;
  onChanged: () => void;
  onAskAgain: () => void;
}) {
  const router = useRouter();
  const { t, tn } = useT();
  const q = useJoinRequest(circle, requestId);
  const writeContractAsync = useBufferedWriteContract();
  const tx = useTx();
  const busy = tx.status === "confirm" || tx.status === "sending";

  if (q.isPending) {
    return (
      <StateView
        state="loading"
        label={t("join.loadingRequest")}
        skeleton={<Skeleton className="h-40 rounded-[14px]" />}
      />
    );
  }
  if (q.isError || !q.request) return <StateView state="error" onRetry={() => q.refetch()} />;

  const r = q.request;
  const status = joinStatusName(r.status);

  async function cancel() {
    const receipt = await tx.run(() =>
      writeContractAsync({
        abi: circleVaultAbi,
        address: circle,
        functionName: "cancelJoinRequest",
      }),
    );
    if (receipt) {
      notify.info(t("join.cancelledToast"));
      void q.refetch();
      onChanged();
    }
  }

  if (status !== "open") {
    return (
      <section
        className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
        data-testid="join-result"
      >
        <h2 className="font-display text-[28px] leading-tight tracking-tight">
          {joinResultMessage(status)}
        </h2>
        <div className="flex flex-wrap gap-3">
          {status === "approved" ? (
            <Button icon={ArrowRight} onClick={() => router.push(`/app/circle/?id=${circle}`)}>
              {t("join.openCircle")}
            </Button>
          ) : (
            <Button variant="secondary" icon={LogIn} onClick={onAskAgain}>
              {t("join.askAgain")}
            </Button>
          )}
        </div>
      </section>
    );
  }

  const need = quorumVotes(r.eligible, quorumPct);
  return (
    <section
      className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
      data-testid="join-status"
    >
      <div className="grid gap-2">
        <h2 className="font-display text-[28px] leading-tight tracking-tight">
          {t("join.waitingTitle")}
        </h2>
        <p className="text-[14.5px] text-muted-foreground">
          {rich(tn("join.waitingBody", r.eligible, { name: r.displayName, need }), {
            b: (c) => <strong className="font-semibold text-foreground">{c}</strong>,
          })}
        </p>
      </div>
      <p className="tabular text-[14px]">{tallyLine({ ...r, quorumPct })}</p>
      <Deadline deadline={r.deadline} chainNow={chainNow} />
      <div>
        <Button
          variant="ghost"
          icon={Undo2}
          workingLabel={t("join.cancelling")}
          state={busy ? "working" : undefined}
          onClick={cancel}
        >
          {t("join.cancelRequest")}
        </Button>
      </div>
      {tx.status !== "idle" && <TxTracker {...trackerProps(tx)} />}
    </section>
  );
}
