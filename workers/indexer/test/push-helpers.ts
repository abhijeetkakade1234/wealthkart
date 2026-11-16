import { createHmac, webcrypto } from "node:crypto";

import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

import { type Action, endpointId, requestIdFor, STATEMENT } from "../src/push/auth";
import type { Vapid } from "../src/push/send";

/** Anvil's first dev key: fake money, public, test only. */
export const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const wallet = privateKeyToAccount(KEY);
export const other = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

export const DOMAIN = "wealthkart.pages.dev";
export const CHAIN = 43113;
export const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123:device-token";

const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");

export async function signedMessage(
  opts: {
    action?: Action;
    endpoint?: string;
    nowSec?: number;
    ttl?: number;
    nonce?: string;
    domain?: string;
    chainId?: number;
    statement?: string;
    signer?: typeof wallet;
    address?: `0x${string}`;
  } = {},
) {
  const action = opts.action ?? "on";
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const domain = opts.domain ?? DOMAIN;
  const signer = opts.signer ?? wallet;
  const message = createSiweMessage({
    domain,
    address: opts.address ?? signer.address,
    statement: opts.statement ?? STATEMENT[action],
    uri: `https://${domain}/app/settings/`,
    version: "1",
    chainId: opts.chainId ?? CHAIN,
    nonce: opts.nonce ?? `n${Math.random().toString(36).slice(2)}${Date.now()}`.slice(0, 24),
    issuedAt: new Date(now * 1000),
    expirationTime: new Date((now + (opts.ttl ?? 300)) * 1000),
    requestId: requestIdFor(action, await endpointId(opts.endpoint ?? ENDPOINT)),
  });
  const signature = await signer.signMessage({ message });
  return { message, signature };
}

/** A device's push keys (what `PushSubscription.toJSON()` gives), plus what's needed to decrypt. */
export async function deviceKeys() {
  const pair = (await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as webcrypto.CryptoKeyPair;
  const pub = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
  const auth = webcrypto.getRandomValues(new Uint8Array(16));
  return { p256dh: b64url(pub), auth: b64url(auth), pair, pub, authBytes: auth };
}

export async function vapidKeys(): Promise<Vapid & { verifyKey: webcrypto.CryptoKey }> {
  const pair = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as webcrypto.CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
  return {
    publicKey: b64url(raw),
    privateKey: jwk.d!,
    subject: "https://wealthkart.pages.dev",
    verifyKey: pair.publicKey,
  };
}

const hmac = (key: Uint8Array, data: Uint8Array) =>
  new Uint8Array(createHmac("sha256", key).update(data).digest());

/** Decrypts an aes128gcm Web Push body as the browser would (RFC 8291 §3.4, RFC 8188). */
export async function decryptPush(
  body: Uint8Array,
  device: Awaited<ReturnType<typeof deviceKeys>>,
): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPub = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  const asKey = await webcrypto.subtle.importKey(
    "raw",
    asPub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await webcrypto.subtle.deriveBits({ name: "ECDH", public: asKey }, device.pair.privateKey, 256),
  );
  const enc = new TextEncoder();
  const prkKey = hmac(device.authBytes, ecdh);
  const keyInfo = new Uint8Array([...enc.encode("WebPush: info\0"), ...device.pub, ...asPub, 1]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, new Uint8Array([...enc.encode("Content-Encoding: aes128gcm\0"), 1])).slice(
    0,
    16,
  );
  const nonce = hmac(prk, new Uint8Array([...enc.encode("Content-Encoding: nonce\0"), 1])).slice(
    0,
    12,
  );
  const key = await webcrypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const padded = new Uint8Array(
    await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext),
  );
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  if (padded[end] !== 2) throw new Error("bad padding delimiter");
  return new TextDecoder().decode(padded.slice(0, end));
}

/** A fake push service: records requests, answers with the given status. */
export function fakePushService(status = 201) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: Uint8Array }> = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as Uint8Array,
    });
    return new Response(null, { status });
  };
  return { calls, fetcher, setStatus: (s: number) => (status = s) };
}
