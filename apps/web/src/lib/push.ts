/**
 * Payment reminders by Web Push (ADR 0052): what the browser can do, the signed message that
 * proves the wallet, and the indexer Worker's push API. No names, emails or phone numbers: the
 * Worker keeps the wallet address, this device's push endpoint and a token hash.
 */
import { getAddress } from "viem";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";

import { INDEXER_URL } from "@/lib/events";

/** Public VAPID key (base64url). Empty = reminders aren't set up for this build. */
export const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();

/** Reminders need the indexer Worker (it sends them) and a VAPID key. */
export const REMINDERS_CONFIGURED = Boolean(INDEXER_URL && VAPID_PUBLIC_KEY);

/** Mirrors `workers/indexer/src/push/kinds.ts`. */
export const KIND = { due: 1, late: 2, interest: 4, votes: 8, money: 16 } as const;
export type ReminderKind = keyof typeof KIND;
export const ALL_KINDS = 31;

/** The switches, in order, with plain labels (human-writing-style, no jargon). */
export const KIND_ROWS: Array<{ kind: ReminderKind; label: string; hint: string }> = [
  {
    kind: "due",
    label: "Installment due",
    hint: "3 days before, the day before, and on the due day",
  },
  { kind: "late", label: "Late fee coming", hint: "A few hours before a late fee starts" },
  { kind: "interest", label: "Loan interest", hint: "When interest is due soon, or late" },
  {
    kind: "votes",
    label: "Votes waiting for you",
    hint: "When a vote needs you, and on its last day",
  },
  {
    kind: "money",
    label: "Money to collect",
    hint: "When your exit payout or a refused payment is ready",
  },
];

export function hasKind(kinds: number, k: ReminderKind) {
  return (kinds & KIND[k]) !== 0;
}

export function toggleKind(kinds: number, k: ReminderKind, on: boolean) {
  return on ? kinds | KIND[k] : kinds & ~KIND[k];
}

/** How this browser can do reminders, before asking anything. */
export type PushSupport = "unsupported" | "ios-install" | "ready";

export interface BrowserFacts {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
}

export function browserFacts(): BrowserFacts {
  if (typeof window === "undefined") {
    return {
      hasServiceWorker: false,
      hasPushManager: false,
      hasNotification: false,
      userAgent: "",
      maxTouchPoints: 0,
      standalone: false,
    };
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone:
      nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true,
  };
}

/** iPhone and iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(f: Pick<BrowserFacts, "userAgent" | "maxTouchPoints">) {
  return (
    /iPad|iPhone|iPod/.test(f.userAgent) || (/Macintosh/.test(f.userAgent) && f.maxTouchPoints > 1)
  );
}

/**
 * iOS only allows Web Push for home-screen apps (iOS 16.4+), so Safari in a tab gets "add to
 * Home Screen" instead of a broken button.
 */
export function pushSupport(f: BrowserFacts): PushSupport {
  if (isIos(f) && !f.standalone) return "ios-install";
  if (!f.hasServiceWorker || !f.hasPushManager || !f.hasNotification) return "unsupported";
  return "ready";
}

/** Same id the Worker signs over: SHA-256 of the endpoint, first 32 hex characters. */
export async function endpointId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** Must match `STATEMENT` in `workers/indexer/src/push/auth.ts` word for word. */
export const STATEMENT = {
  on: "Turn on WealthKart reminders on this device. Signing is free and moves no money.",
  off: "Turn off WealthKart reminders on this device. Signing is free and moves no money.",
} as const;

/**
 * The Sign-In with Ethereum message (EIP-4361) Core shows. It names this site, the action and
 * this device, and expires in 5 minutes. Signing it costs nothing.
 */
export async function signInMessage(p: {
  address: `0x${string}`;
  action: "on" | "off";
  endpoint: string;
  chainId: number;
  origin: string;
  now?: Date;
}): Promise<string> {
  const url = new URL(p.origin);
  const issuedAt = p.now ?? new Date();
  return createSiweMessage({
    domain: url.host,
    address: p.address,
    statement: STATEMENT[p.action],
    uri: `${url.origin}/app/settings/`,
    version: "1",
    chainId: p.chainId,
    nonce: generateSiweNonce().slice(0, 32),
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + 5 * 60_000),
    requestId: `push-${p.action}:${await endpointId(p.endpoint)}`,
  });
}

/** The Worker keeps addresses lowercase; show them checksummed like everywhere else. */
export function displayAddress(a: string): string {
  try {
    return getAddress(a);
  } catch {
    return a;
  }
}

/** Base64url VAPID key to the bytes `pushManager.subscribe` wants. */
export function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------- this device

/** What this device remembers: which endpoint it registered, for which wallet, and its token. */
export interface DeviceRecord {
  endpoint: string;
  token: string;
  address: string;
  chainId: number;
}

const STORE_KEY = "wk:reminders";

export function readDevice(): DeviceRecord | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<DeviceRecord>;
    if (
      typeof v.endpoint === "string" &&
      typeof v.token === "string" &&
      typeof v.address === "string" &&
      typeof v.chainId === "number"
    ) {
      return v as DeviceRecord;
    }
  } catch {
    // Private mode or blocked storage: the device just looks "off".
  }
  return null;
}

export function writeDevice(rec: DeviceRecord | null) {
  try {
    if (rec) localStorage.setItem(STORE_KEY, JSON.stringify(rec));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    // Same as above.
  }
}

// ---------------------------------------------------------------- push API client

export interface CircleSetting {
  circle: string;
  kinds: number;
}

/** A push API refusal, with the HTTP status for mapping to plain messages. */
export class PushApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PushApiError";
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${INDEXER_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PushApiError(0, "network");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new PushApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data;
}

export const pushApi = {
  subscribe: (body: {
    message: string;
    signature: string;
    subscription: PushSubscriptionJSON;
    circles: string[];
  }) =>
    post<{ token: string; address: string; circles: CircleSetting[] }>("/v1/push/subscribe", body),
  unsubscribe: (body: { endpoint: string; token: string }) =>
    post<{ ok: boolean }>("/v1/push/unsubscribe", body),
  settings: (body: { endpoint: string; token: string }) =>
    post<{ address: string; circles: CircleSetting[] }>("/v1/push/settings", body),
  setCircle: (body: { endpoint: string; token: string; circle: string; kinds: number }) =>
    post<CircleSetting>("/v1/push/circle", body),
  test: (body: { endpoint: string; token: string }) =>
    post<{ sent: boolean; gone?: boolean }>("/v1/push/test", body),
};
