"use client";

import { DEPLOYMENTS, circleFactoryAbi, circleVaultAbi } from "@wealthkart/sdk";
import { type Address, isAddress } from "viem";
import { useReadContract, useReadContracts } from "wagmi";

import { useCoreWallet } from "@/components/wallet/use-core-wallet";

export const CIRCLES_PAGE_SIZE = 12;
export const MEMBERS_PAGE_SIZE = 10;

/** The factory for the wallet's current chain, or null if not deployed there yet. */
export function useFactory(): Address | null {
  const { chainId } = useCoreWallet();
  return chainId ? (DEPLOYMENTS[chainId]?.circleFactory ?? null) : null;
}

/** Parses `?id=` safely; anything that isn't an address becomes null ("circle not found"). */
export function parseCircleId(raw: string | null): Address | null {
  return raw && isAddress(raw) ? (raw as Address) : null;
}

export interface CircleSummary {
  address: Address;
  name: string;
  totalAssets: bigint;
  memberCount: bigint;
  stake: bigint;
  due: { period: bigint; amount: bigint; fees: bigint; payable: boolean } | null;
  isMember: boolean;
}

/** One page of the connected wallet's circles, with the numbers each card needs. */
export function useMyCircles(page: number) {
  const { address } = useCoreWallet();
  const factory = useFactory();
  const enabled = Boolean(factory && address);

  const count = useReadContract({
    abi: circleFactoryAbi,
    address: factory ?? undefined,
    functionName: "circlesOfCount",
    args: address ? [address] : undefined,
    query: { enabled },
  });

  const list = useReadContract({
    abi: circleFactoryAbi,
    address: factory ?? undefined,
    functionName: "circlesOf",
    args: address
      ? [address, BigInt((page - 1) * CIRCLES_PAGE_SIZE), BigInt(CIRCLES_PAGE_SIZE)]
      : undefined,
    query: { enabled, placeholderData: (prev) => prev },
  });

  const circles = (list.data ?? []) as readonly Address[];
  const details = useReadContracts({
    allowFailure: true,
    contracts: circles.flatMap((c) => [
      { abi: circleVaultAbi, address: c, functionName: "name" } as const,
      { abi: circleVaultAbi, address: c, functionName: "totalAssets" } as const,
      { abi: circleVaultAbi, address: c, functionName: "memberCount" } as const,
      { abi: circleVaultAbi, address: c, functionName: "stakeOf", args: [address!] } as const,
      { abi: circleVaultAbi, address: c, functionName: "amountDue", args: [address!] } as const,
    ]),
    query: { enabled: enabled && circles.length > 0, placeholderData: (prev) => prev },
  });

  const summaries: CircleSummary[] = circles.map((c, i) => {
    const r = details.data?.slice(i * 5, i * 5 + 5) ?? [];
    const due =
      r[4]?.status === "success"
        ? (r[4].result as readonly [bigint, bigint, bigint, boolean])
        : null;
    return {
      address: c,
      name: r[0]?.status === "success" ? (r[0].result as string) : "Circle",
      totalAssets: r[1]?.status === "success" ? (r[1].result as bigint) : 0n,
      memberCount: r[2]?.status === "success" ? (r[2].result as bigint) : 0n,
      stake: r[3]?.status === "success" ? (r[3].result as bigint) : 0n,
      // amountDue reverts with NotAMember for circles this wallet isn't in.
      due: due ? { period: due[0], amount: due[1], fees: due[2], payable: due[3] } : null,
      isMember: r[4]?.status === "success",
    };
  });

  return {
    factory,
    total: count.data === undefined ? undefined : Number(count.data),
    circles: summaries,
    isPending:
      enabled && (count.isPending || list.isPending || (circles.length > 0 && details.isPending)),
    isError: count.isError || list.isError,
    refetch: () => {
      void count.refetch();
      void list.refetch();
      void details.refetch();
    },
  };
}

/** Everything the circle overview and pay pages need about one circle. */
export function useCircle(id: Address | null) {
  const { address } = useCoreWallet();
  const enabled = Boolean(id && address);
  const vault = { abi: circleVaultAbi, address: id ?? undefined } as const;

  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...vault, functionName: "name" },
      { ...vault, functionName: "totalAssets" },
      { ...vault, functionName: "memberCount" },
      { ...vault, functionName: "installment" },
      { ...vault, functionName: "dueDay" },
      { ...vault, functionName: "fee1" },
      { ...vault, functionName: "fee2" },
      { ...vault, functionName: "secondFeeDay" },
      { ...vault, functionName: "holidaysPerYear" },
      { ...vault, functionName: "navPerShareE18" },
      { ...vault, functionName: "isMember", args: [address!] },
      { ...vault, functionName: "stakeOf", args: [address!] },
      { ...vault, functionName: "amountDue", args: [address!] },
    ] as const,
    query: { enabled },
  });

  const r = q.data;
  const ok = <T>(i: number): T | undefined =>
    r?.[i]?.status === "success" ? (r[i].result as T) : undefined;
  const due = ok<readonly [bigint, bigint, bigint, boolean]>(12);

  return {
    ...q,
    // name failing means the address isn't a WealthKart circle on this network
    notFound: Boolean(r && r[0]?.status !== "success"),
    data: r
      ? {
          name: ok<string>(0) ?? "",
          totalAssets: ok<bigint>(1) ?? 0n,
          memberCount: ok<bigint>(2) ?? 0n,
          installment: ok<bigint>(3) ?? 0n,
          dueDay: ok<number>(4) ?? 10,
          fee1: ok<bigint>(5) ?? 0n,
          fee2: ok<bigint>(6) ?? 0n,
          secondFeeDay: ok<number>(7) ?? 20,
          holidaysPerYear: ok<number>(8) ?? 0,
          navPerShareE18: ok<bigint>(9) ?? 0n,
          isMember: ok<boolean>(10) ?? false,
          stake: ok<bigint>(11) ?? 0n,
          due: due ? { period: due[0], amount: due[1], fees: due[2], payable: due[3] } : null,
        }
      : undefined,
  };
}

/** One page of a circle's members with their share balances. */
export function useCircleMembers(id: Address | null, page: number) {
  const list = useReadContract({
    abi: circleVaultAbi,
    address: id ?? undefined,
    functionName: "membersPage",
    args: [BigInt((page - 1) * MEMBERS_PAGE_SIZE), BigInt(MEMBERS_PAGE_SIZE)],
    query: { enabled: Boolean(id), placeholderData: (prev) => prev },
  });
  const members = (list.data ?? []) as readonly Address[];
  const info = useReadContracts({
    allowFailure: true,
    contracts: members.flatMap((m) => [
      { abi: circleVaultAbi, address: id!, functionName: "memberOf", args: [m] } as const,
      { abi: circleVaultAbi, address: id!, functionName: "stakeOf", args: [m] } as const,
    ]),
    query: { enabled: Boolean(id) && members.length > 0, placeholderData: (prev) => prev },
  });
  return {
    ...list,
    rows: members.map((m, i) => {
      const mo = info.data?.[i * 2];
      const st = info.data?.[i * 2 + 1];
      const member =
        mo?.status === "success"
          ? (mo.result as { active: boolean; nextPeriod: number; shares: bigint })
          : null;
      return {
        address: m,
        nextPeriod: member ? BigInt(member.nextPeriod) : null,
        shares: member?.shares ?? 0n,
        stake: st?.status === "success" ? (st.result as bigint) : 0n,
      };
    }),
    isPending: list.isPending || (members.length > 0 && info.isPending),
  };
}
