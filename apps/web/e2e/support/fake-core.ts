import type { Page } from "@playwright/test";

import { ANVIL_URL, CHAIN_ID } from "./env";

/**
 * Injects a test wallet that announces itself like Core (EIP-6963, rdns app.core.extension)
 * and forwards every request to the local anvil node. Anvil signs for its unlocked dev
 * accounts, so transactions are real: same contracts, same reverts, same receipts.
 */
export async function installFakeCore(page: Page, account: string) {
  await page.addInitScript(
    ({ rpc, chainId, account }) => {
      const listeners: Record<string, Array<(arg: unknown) => void>> = {};
      // Survives reloads like a real wallet's site permission.
      let connected = localStorage.getItem("e2e:core-connected") === "1";
      const setConnected = (v: boolean) => {
        connected = v;
        localStorage.setItem("e2e:core-connected", v ? "1" : "0");
      };
      let id = 0;
      const rpcCall = async (method: string, params: unknown[] = []) => {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        });
        const json = await res.json();
        if (json.error) {
          const err = new Error(json.error.message) as Error & { code?: number; data?: unknown };
          err.code = json.error.code;
          err.data = json.error.data;
          throw err;
        }
        return json.result;
      };
      const provider = {
        isAvalanche: true,
        async request({ method, params }: { method: string; params?: unknown[] }) {
          switch (method) {
            case "eth_requestAccounts":
              setConnected(true);
              listeners.connect?.forEach((l) => l({ chainId: `0x${chainId.toString(16)}` }));
              return [account];
            case "eth_accounts":
              return connected ? [account] : [];
            case "eth_chainId":
              return `0x${chainId.toString(16)}`;
            case "net_version":
              return String(chainId);
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              return null;
            case "wallet_requestPermissions":
              setConnected(true);
              return [{ parentCapability: "eth_accounts" }];
            case "wallet_getPermissions":
              return connected ? [{ parentCapability: "eth_accounts" }] : [];
            case "wallet_revokePermissions":
              setConnected(false);
              return null;
            default:
              return rpcCall(method, params ?? []);
          }
        },
        on(event: string, fn: (arg: unknown) => void) {
          (listeners[event] ??= []).push(fn);
        },
        removeListener(event: string, fn: (arg: unknown) => void) {
          listeners[event] = (listeners[event] ?? []).filter((l) => l !== fn);
        },
      };
      const info = {
        uuid: "00000000-0000-4000-8000-0000000c0de0",
        name: "Core",
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
        rdns: "app.core.extension",
      };
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: Object.freeze({ info, provider }),
          }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { rpc: ANVIL_URL, chainId: CHAIN_ID, account },
  );
}
