"use client";

import { circleFactoryAbi, DEPLOYMENTS, reputationAbi } from "@wealthkart/sdk";
import { type Address, isAddress } from "viem";
import { useReadContract, useReadContracts } from "wagmi";

import { t, tn } from "@/i18n/runtime";
import { FACTORY_OVERRIDE } from "@/lib/circle";
import { TARGET_CHAIN } from "@/lib/wagmi";

/**
 * The public repayment record (ADR 0042): a wallet's soulbound counters across every circle.
 * Works without a connected wallet: it reads the app's target chain.
 */

export interface RecordView {
  onTime: number;
  late: number;
  loansRepaid: number;
  defaults: number;
  circles: number;
  firstSeen: number;
  lastSeen: number;
  onTimeBps: number;
}

/** Plain-words summary line for a record. */
export function recordSummary(r: RecordView): string {
  const months = r.onTime + r.late;
  if (months === 0 && r.loansRepaid === 0 && r.defaults === 0) return t("record.none");
  const parts = [
    tn("record.onTime", months, {
      pct: (r.onTimeBps / 100).toFixed(r.onTimeBps % 100 === 0 ? 0 : 1),
    }),
    tn("record.repaid", r.loansRepaid),
    r.defaults === 0 ? t("record.noDefaults") : tn("record.defaultCount", r.defaults),
  ];
  return tn("record.across", r.circles, { parts: parts.join(", ") });
}

export function parseAddress(raw: string | null): Address | null {
  return raw && isAddress(raw) ? raw : null;
}

export function useRecord(wallet: Address | null) {
  const factory: Address | null =
    FACTORY_OVERRIDE && isAddress(FACTORY_OVERRIDE)
      ? FACTORY_OVERRIDE
      : (DEPLOYMENTS[TARGET_CHAIN.id]?.circleFactory ?? null);
  const rep = useReadContract({
    abi: circleFactoryAbi,
    address: factory ?? undefined,
    functionName: "reputation",
    chainId: TARGET_CHAIN.id,
    query: { enabled: Boolean(factory) },
  });
  const reputation = rep.data as Address | undefined;
  const q = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        abi: reputationAbi,
        address: reputation,
        functionName: "recordOf",
        args: [wallet!],
        chainId: TARGET_CHAIN.id,
      },
      {
        abi: reputationAbi,
        address: reputation,
        functionName: "onTimeBps",
        args: [wallet!],
        chainId: TARGET_CHAIN.id,
      },
    ] as const,
    query: { enabled: Boolean(reputation && wallet) },
  });
  const data = q.data;
  const rec = data?.[0] as
    | {
        onTime: number;
        late: number;
        loansRepaid: number;
        defaults: number;
        circles: number;
        firstSeen: bigint;
        lastSeen: bigint;
      }
    | undefined;
  return {
    noFactory: !factory,
    isPending: Boolean(wallet) && (rep.isPending || (Boolean(reputation) && q.isPending)),
    isError: rep.isError || q.isError,
    refetch: () => {
      void rep.refetch();
      void q.refetch();
    },
    record: rec
      ? ({
          onTime: Number(rec.onTime),
          late: Number(rec.late),
          loansRepaid: Number(rec.loansRepaid),
          defaults: Number(rec.defaults),
          circles: Number(rec.circles),
          firstSeen: Number(rec.firstSeen),
          lastSeen: Number(rec.lastSeen),
          onTimeBps: Number(data?.[1] ?? 0n),
        } satisfies RecordView)
      : null,
  };
}
