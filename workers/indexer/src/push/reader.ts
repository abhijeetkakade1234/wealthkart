import { circleVaultAbi } from "@wealthkart/sdk";
import { type Address, createPublicClient, http, parseAbi, zeroAddress } from "viem";

import type { CircleFacts, MemberFacts, OpenVote } from "./schedule";

/**
 * Reads what reminders need from the chain (ADR 0052). Calls go out as JSON-RPC batches, so one
 * cron run costs a few HTTP subrequests however many members it checks (Workers free tier: 50
 * subrequests per run). The chain is the source of truth; the indexer's tables only say which
 * circles are real (factory-created), so a look-alike contract never gets a reminder.
 */

export interface ReminderReader {
  circle(address: string): Promise<CircleFacts>;
  member(circle: CircleFacts, member: string): Promise<MemberFacts>;
}

const assetAbi = parseAbi(["function asset() view returns (address)"]);

/** Open votes read per list. The contracts cap them at 20 (joins) and 10 (proposals). */
const VOTE_PAGE = 25n;

/** `isMember(member)` for many circles in one JSON-RPC batch (push API, ADR 0052). */
export function viemMembership(rpcUrl: string) {
  const client = createPublicClient({ transport: http(rpcUrl, { batch: { batchSize: 50 } }) });
  return (circles: string[], member: string) =>
    Promise.all(
      circles.map((c) =>
        client
          .readContract({
            address: c as Address,
            abi: circleVaultAbi,
            functionName: "isMember",
            args: [member as Address],
          })
          .then((v) => v === true),
      ),
    );
}

export function viemReminderReader(rpcUrl: string): ReminderReader {
  const client = createPublicClient({
    transport: http(rpcUrl, { batch: { batchSize: 40, wait: 16 } }),
  });
  const read = <T>(address: string, functionName: string, args: unknown[] = []) =>
    client.readContract({
      address: address as Address,
      abi: circleVaultAbi,
      functionName,
      args,
    } as never) as Promise<T>;

  return {
    async circle(address) {
      const [name, asset, dueDay, secondFeeDay, fee1, fee2, dissolved, joins, loans, props] =
        await Promise.all([
          read<string>(address, "name"),
          client.readContract({
            address: address as Address,
            abi: assetAbi,
            functionName: "asset",
          }),
          read<number>(address, "dueDay"),
          read<number>(address, "secondFeeDay"),
          read<bigint>(address, "fee1"),
          read<bigint>(address, "fee2"),
          read<boolean>(address, "dissolved"),
          read<readonly [readonly bigint[], readonly { deadline: bigint }[]]>(
            address,
            "openRequestsPage",
            [0n, VOTE_PAGE],
          ),
          read<readonly [readonly bigint[], readonly { deadline: bigint }[]]>(
            address,
            "openLoanRequestsPage",
            [0n, VOTE_PAGE],
          ),
          read<readonly [readonly bigint[], readonly { deadline: bigint }[]]>(
            address,
            "openProposalsPage",
            [0n, VOTE_PAGE],
          ),
        ]);
      const votes: OpenVote[] = [];
      const add = (
        prefix: string,
        page: readonly [readonly bigint[], readonly { deadline: bigint }[]],
      ) =>
        page[0].forEach((id, i) =>
          votes.push({ key: `${prefix}:${id}`, deadline: Number(page[1][i]?.deadline ?? 0n) }),
        );
      add("m", joins);
      add("l", loans);
      add("p", props);
      const usdt = asset !== zeroAddress;
      return {
        address: address.toLowerCase(),
        name,
        // ADR 0046: zero = AVAX (18 decimals), else the factory's USDT (6 decimals).
        asset: usdt ? { symbol: "USDT", decimals: 6 } : { symbol: "AVAX", decimals: 18 },
        dueDay: Number(dueDay),
        secondFeeDay: Number(secondFeeDay),
        fee1,
        fee2,
        dissolved,
        votes,
      };
    },

    async member(c, member) {
      const settle = <T>(p: Promise<T>) =>
        p.then(
          (v) => ({ ok: true as const, v }),
          () => ({ ok: false as const }),
        );
      const voteFn: Record<string, string> = {
        m: "canVote",
        l: "canVoteLoan",
        p: "canVoteProposal",
      };
      const [m, due, interest, exit, withdrawable, ...can] = await Promise.all([
        read<{ active: boolean; dormant: boolean }>(c.address, "memberOf", [member]),
        settle(read<readonly [bigint, bigint, bigint, boolean]>(c.address, "amountDue", [member])),
        settle(read<readonly [bigint, bigint, bigint]>(c.address, "interestDue", [member])),
        settle(read<{ requestedAt: bigint; maturesAt: bigint }>(c.address, "exitOf", [member])),
        read<bigint>(c.address, "withdrawable", [member]),
        ...c.votes.map((v) => {
          const [prefix, id] = v.key.split(":");
          return settle(read<boolean>(c.address, voteFn[prefix!]!, [BigInt(id!), member]));
        }),
      ]);
      const d = due.ok
        ? { period: Number(due.v[0]), amount: due.v[1], fees: due.v[2], payable: due.v[3] }
        : null;
      const holiday =
        d && d.payable
          ? await read<boolean>(c.address, "holidayFor", [member, BigInt(d.period)]).catch(
              () => false,
            )
          : false;
      return {
        active: m.active,
        dormant: m.dormant,
        due: d,
        holiday,
        interest:
          interest.ok && (interest.v[0] > 0n || interest.v[1] > 0n)
            ? { interest: interest.v[0], fees: interest.v[1], overdue: Number(interest.v[2]) }
            : null,
        exit: exit.ok && exit.v.requestedAt > 0n ? { maturesAt: Number(exit.v.maturesAt) } : null,
        withdrawable,
        canVote: c.votes.filter((_, i) => can[i]?.ok && can[i].v).map((v) => v.key),
      };
    },
  };
}
