"use client";

import { circleVaultAbi, formatAvax, shortAddress } from "@wealthkart/sdk";
import { ArrowRight, Check, LogIn, Undo2, UserPlus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { type Address, isAddress } from "viem";
import { useReadContract, useWriteContract } from "wagmi";

import { CircleNotFound } from "@/components/app/circle-not-found";
import { Deadline } from "@/components/app/deadline";
import { PageHeader } from "@/components/app/page-header";
import { CircleCover } from "@/components/art";
import { Button, InlineAlert, StateView, TxTracker } from "@/components/kit";
import { DisplayNameField, useNameCheck } from "@/components/membership/display-name-field";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
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
        label="Loading the circle"
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
        message={`You're a member of ${d.name}.`}
        action={{ label: "Open the circle", onAction: () => router.push(`/app/circle/?id=${id}`) }}
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
        {inviteExpired && (
          <InlineAlert tone="warn">
            Your founder invite expired. You can still ask to join; the members will vote.
          </InlineAlert>
        )}
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
        subtitle={
          inviteLive
            ? "You've been invited as a founder."
            : "You've been invited to join this circle."
        }
      />
      <CircleFacts d={d} />
      <div className="mt-14 grid gap-8">{body}</div>
    </div>
  );
}

function CircleFacts({ d }: { d: NonNullable<ReturnType<typeof useCircle>["data"]> }) {
  const hours = Math.round(d.votingWindow / 3600);
  const facts: Array<[string, string]> = [
    ["Each month", `${formatAvax(d.installment)} AVAX`],
    ["Due", `Day ${d.dueDay}, 23:59 UTC`],
    [
      "Late fees",
      `${formatAvax(d.fee1)} AVAX after day ${d.dueDay}, ${formatAvax(d.fee2)} more after day ${d.secondFeeDay}`,
    ],
    ["Members", d.maxMembers > 0 ? `${d.memberCount} of ${d.maxMembers}` : String(d.memberCount)],
    [
      "Joining",
      `${d.quorumPct}% of members vote, ${ADMISSION_PASS_PCT}% yes to get in, ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`} to vote`,
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
  const { writeContractAsync } = useWriteContract();
  const acceptTx = useTx();
  const declineTx = useTx();
  const busy = (t: { status: string }) => t.status === "confirm" || t.status === "sending";

  async function accept() {
    const receipt = await acceptTx.run(() =>
      writeContractAsync({ abi: circleVaultAbi, address: circle, functionName: "acceptInvite" }),
    );
    if (receipt) {
      notify.success("Welcome in. You're a founder of this circle now.");
      onDone();
    }
  }
  async function decline() {
    const receipt = await declineTx.run(() =>
      writeContractAsync({ abi: circleVaultAbi, address: circle, functionName: "declineInvite" }),
    );
    if (receipt) {
      notify.info("Invite declined. Nothing else changes.");
      onDone();
    }
  }

  return (
    <section className="grid gap-6">
      <p className="text-[15px] leading-relaxed">
        The person who started this circle named you as a founder. Accept to become a member
        straight away, with no vote. You start paying from the next due date that hasn&apos;t passed
        yet.
      </p>
      <Deadline deadline={expiresAt} chainNow={chainNow} prefix="Invite expires" />
      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          icon={Check}
          workingLabel="Joining…"
          state={busy(acceptTx) ? "working" : undefined}
          onClick={accept}
        >
          Accept invite
        </Button>
        <Button
          size="lg"
          variant="secondary"
          icon={X}
          workingLabel="Declining…"
          state={busy(declineTx) ? "working" : undefined}
          onClick={decline}
        >
          Decline
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
  const check = useNameCheck(circle, me, name);
  const { writeContractAsync } = useWriteContract();
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
      notify.success("Request sent. The members will vote on it.");
      onSent(null);
    }
  }

  if (full) {
    return (
      <InlineAlert tone="warn">
        This circle is full. It has reached the member limit its rules set.
      </InlineAlert>
    );
  }

  return (
    <section className="grid gap-8">
      <div className="grid gap-2">
        <h2 className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          Ask to join
        </h2>
        <p className="text-[14.5px] leading-relaxed text-muted-foreground">
          Pick the name members will see, then send your request. The members vote: enough of them
          must take part, and {ADMISSION_PASS_PCT}% of votes must be yes. Nothing is paid now; your
          first installment is due after you&apos;re in.
        </p>
      </div>
      {validInviter && (
        <p className="text-[14px]">
          Invited by{" "}
          <strong className="font-semibold">
            {inviterName.data || shortAddress(validInviter)}
          </strong>
          . Members will see this; it counts as confirmed once they vote yes.
        </p>
      )}
      {tooMany && (
        <InlineAlert tone="warn">
          Too many people are waiting to join right now. Try again after the members vote.
        </InlineAlert>
      )}
      <DisplayNameField value={name} onChange={setName} check={check} />
      <div>
        <Button
          size="lg"
          icon={UserPlus}
          workingLabel="Sending…"
          state={busy ? "working" : undefined}
          onClick={send}
          disabled={check.state !== "available" || tooMany}
          disabledReason={tooMany ? "Too many requests waiting" : "Pick a free name first"}
        >
          Ask to join
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
  const q = useJoinRequest(circle, requestId);
  const { writeContractAsync } = useWriteContract();
  const tx = useTx();
  const busy = tx.status === "confirm" || tx.status === "sending";

  if (q.isPending) {
    return (
      <StateView
        state="loading"
        label="Loading your request"
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
      notify.info("Request cancelled.");
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
              Open the circle
            </Button>
          ) : (
            <Button variant="secondary" icon={LogIn} onClick={onAskAgain}>
              Ask again
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
        <h2 className="font-display text-[28px] leading-tight tracking-tight">Waiting for votes</h2>
        <p className="text-[14.5px] text-muted-foreground">
          You asked to join as{" "}
          <strong className="font-semibold text-foreground">{r.displayName}</strong>. At least{" "}
          {need} of {r.eligible} {r.eligible === 1 ? "member" : "members"} must vote.
        </p>
      </div>
      <p className="tabular text-[14px]">{tallyLine({ ...r, quorumPct })}</p>
      <Deadline deadline={r.deadline} chainNow={chainNow} />
      <div>
        <Button
          variant="ghost"
          icon={Undo2}
          workingLabel="Cancelling…"
          state={busy ? "working" : undefined}
          onClick={cancel}
        >
          Cancel my request
        </Button>
      </div>
      {tx.status !== "idle" && <TxTracker {...trackerProps(tx)} />}
    </section>
  );
}
