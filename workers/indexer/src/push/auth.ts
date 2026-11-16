import { type Hex, recoverMessageAddress } from "viem";
import { parseSiweMessage } from "viem/siwe";

/**
 * Proof of wallet ownership for the push API (ADR 0052). The app asks Core to sign a standard
 * Sign-In with Ethereum message (EIP-4361), so the wallet shows the site's domain and can warn on
 * a mismatch. The message names the action and a hash of this device's push endpoint, expires
 * within 10 minutes, and its nonce is accepted once. Signing costs nothing and moves no money.
 *
 * Only plain wallets (EOAs) are checked; Core is one. Contract wallets would need an RPC call
 * (ERC-1271) and aren't supported for reminders yet.
 */

export const STATEMENT = {
  on: "Turn on WealthKart reminders on this device. Signing is free and moves no money.",
  off: "Turn off WealthKart reminders on this device. Signing is free and moves no money.",
} as const;

export type Action = keyof typeof STATEMENT;

/** Longest a signed message may live, and how far ahead of our clock it may be issued. */
export const MAX_TTL_SEC = 10 * 60;
export const CLOCK_SKEW_SEC = 2 * 60;

const NONCE = /^[A-Za-z0-9]{16,64}$/;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Short, stable id for a push endpoint, signed into the message so it can't be swapped. */
export async function endpointId(endpoint: string): Promise<string> {
  return (await sha256Hex(endpoint)).slice(0, 32);
}

export function requestIdFor(action: Action, endpointHash: string) {
  return `push-${action}:${endpointHash}`;
}

/** `example.com` or `*.example.com` entries; a wildcard matches subdomains only. */
export function domainAllowed(domain: string, allowed: string[]): boolean {
  const d = domain.toLowerCase();
  return allowed.some((raw) => {
    const a = raw.trim().toLowerCase();
    if (!a) return false;
    if (a.startsWith("*.")) return d.endsWith(a.slice(1)) && d.length > a.length - 1;
    return d === a;
  });
}

export interface Verified {
  address: string;
  nonce: string;
  expires: number;
}

export interface VerifyInput {
  message: unknown;
  signature: unknown;
  action: Action;
  endpoint: string;
  chainId: number;
  domains: string[];
  nowSec: number;
}

/** Returns the verified wallet, or a plain reason it was refused. Never throws. */
export async function verifySigned(
  input: VerifyInput,
): Promise<{ ok: true; value: Verified } | { ok: false; reason: string }> {
  const { message, signature } = input;
  if (typeof message !== "string" || message.length > 2000) {
    return { ok: false, reason: "Missing signed message." };
  }
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    return { ok: false, reason: "Missing signature." };
  }
  let m: ReturnType<typeof parseSiweMessage>;
  try {
    m = parseSiweMessage(message);
  } catch {
    return { ok: false, reason: "The signed message isn't readable." };
  }
  if (!m.address || !m.domain || !m.nonce || !m.issuedAt || !m.expirationTime) {
    return { ok: false, reason: "The signed message is incomplete." };
  }
  if (!domainAllowed(m.domain, input.domains)) {
    return { ok: false, reason: "The signed message is for another site." };
  }
  try {
    if (!m.uri || new URL(m.uri).host.toLowerCase() !== m.domain.toLowerCase()) {
      return { ok: false, reason: "The signed message is for another site." };
    }
  } catch {
    return { ok: false, reason: "The signed message is for another site." };
  }
  if (m.version !== "1" || m.chainId !== input.chainId) {
    return { ok: false, reason: "The signed message is for another network." };
  }
  if (m.statement !== STATEMENT[input.action]) {
    return { ok: false, reason: "The signed message asks for something else." };
  }
  if (m.requestId !== requestIdFor(input.action, await endpointId(input.endpoint))) {
    return { ok: false, reason: "The signed message is for another device." };
  }
  if (!NONCE.test(m.nonce)) return { ok: false, reason: "The signed message is incomplete." };
  const issued = Math.floor(m.issuedAt.getTime() / 1000);
  const expires = Math.floor(m.expirationTime.getTime() / 1000);
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    issued > input.nowSec + CLOCK_SKEW_SEC ||
    expires <= input.nowSec ||
    expires - issued > MAX_TTL_SEC ||
    expires < issued
  ) {
    return { ok: false, reason: "The signed message has expired. Try again." };
  }
  if (m.notBefore && m.notBefore.getTime() / 1000 > input.nowSec + CLOCK_SKEW_SEC) {
    return { ok: false, reason: "The signed message isn't valid yet." };
  }
  let signer: string;
  try {
    signer = await recoverMessageAddress({ message, signature: signature as Hex });
  } catch {
    return { ok: false, reason: "The signature doesn't match." };
  }
  if (signer.toLowerCase() !== m.address.toLowerCase()) {
    return { ok: false, reason: "The signature doesn't match." };
  }
  return { ok: true, value: { address: signer.toLowerCase(), nonce: m.nonce, expires } };
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh device token (returned once) and the hash we keep. */
export async function newToken(): Promise<{ token: string; hash: string }> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  return { token, hash: await sha256Hex(token) };
}

/** Compares two equal-length hex strings without an early exit. */
export function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
