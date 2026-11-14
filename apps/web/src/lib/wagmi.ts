import { DEFAULT_CHAIN, SUPPORTED_CHAINS } from "@wealthkart/sdk";
import { createConfig, http, injected } from "wagmi";

/**
 * Wallet config (ADR 0003): Core Wallet only. Core announces itself through EIP-6963
 * with this id; wagmi turns each announced wallet into its own connector.
 */
export const CORE_CONNECTOR_ID = "app.core.extension";
export const CORE_DOWNLOAD_URL = "https://core.app/";

export const wagmiConfig = createConfig({
  chains: SUPPORTED_CHAINS,
  multiInjectedProviderDiscovery: true,
  connectors: [injected({ shimDisconnect: true })],
  transports: Object.fromEntries(SUPPORTED_CHAINS.map((c) => [c.id, http()])),
  ssr: false,
});

export const TARGET_CHAIN = DEFAULT_CHAIN;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
