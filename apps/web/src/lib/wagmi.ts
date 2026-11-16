import { chainForNetwork } from "@wealthkart/sdk";
import { createConfig, http, injected } from "wagmi";

/**
 * Wallet config (ADR 0003): Core Wallet only. Core announces itself through EIP-6963
 * with this id; wagmi turns each announced wallet into its own connector.
 */
export const CORE_CONNECTOR_ID = "app.core.extension";
export const CORE_DOWNLOAD_URL = "https://core.app/";

/** The one chain this build talks to: `NEXT_PUBLIC_NETWORK` = fuji (default) or mainnet (ADR 0051). */
export const TARGET_CHAIN = chainForNetwork(process.env.NEXT_PUBLIC_NETWORK);

export const wagmiConfig = createConfig({
  chains: [TARGET_CHAIN],
  multiInjectedProviderDiscovery: true,
  connectors: [injected({ shimDisconnect: true })],
  // NEXT_PUBLIC_RPC_URL points reads at a custom node (E2E uses a local anvil chain).
  transports: { [TARGET_CHAIN.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined) },
  ssr: false,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
