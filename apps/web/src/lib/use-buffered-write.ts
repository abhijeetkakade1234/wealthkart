"use client";

import { useCallback } from "react";
import { usePublicClient, useWriteContract } from "wagmi";

import { useCoreWallet } from "@/components/wallet/use-core-wallet";

/** Headroom over the gas estimate: nested calls only get 63/64 of the gas left (EIP-150). */
const BUFFER_PCT = 130n;

/**
 * `writeContractAsync` with a gas limit 30% above the estimate. Every circle write ends with
 * nested calls (reputation record, factory registry, payouts), and a wallet that sends exactly
 * the estimate can run them out of gas. If the estimate itself fails, the call goes ahead
 * without a limit so the wallet shows the contract's own error message.
 */
export function useBufferedWriteContract() {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const { address } = useCoreWallet();

  return useCallback(
    async (params: Parameters<typeof writeContractAsync>[0]) => {
      const p = params as unknown as Record<string, unknown> & { gas?: bigint };
      if (p.gas !== undefined || !client || !address) return writeContractAsync(params);
      try {
        const estimate = await client.estimateContractGas({
          ...(p as object),
          account: address,
        } as Parameters<typeof client.estimateContractGas>[0]);
        return writeContractAsync({
          ...(params as object),
          gas: (estimate * BUFFER_PCT) / 100n,
        } as typeof params);
      } catch {
        return writeContractAsync(params);
      }
    },
    [writeContractAsync, client, address],
  ) as unknown as typeof writeContractAsync;
}
