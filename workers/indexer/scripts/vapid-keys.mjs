// Prints a fresh VAPID key pair for Web Push reminders (ADR 0052). No dependencies.
//
//   node scripts/vapid-keys.mjs
//
// Put the public key in wrangler.toml (VAPID_PUBLIC_KEY) and in the web build
// (NEXT_PUBLIC_VAPID_PUBLIC_KEY). Store the private key only as a Worker secret:
//   pnpm exec wrangler secret put VAPID_PRIVATE_KEY [--env mainnet]
// Never commit it. Changing keys later means every device has to turn reminders on again.
import { webcrypto } from "node:crypto";

export async function generateVapidKeys() {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey: Buffer.from(raw).toString("base64url"), privateKey: jwk.d };
}

// Run directly (not imported): print the pair.
if (process.argv[1] && process.argv[1].endsWith("vapid-keys.mjs")) {
  const keys = await generateVapidKeys();
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
}
