"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import "@/i18n/boot";
import { LocaleBoot } from "@/i18n/react";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * Wallet + data providers, plus the saved language (ADR 0057). Client-only: the app is a
 * static export with no server.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <LocaleBoot />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
