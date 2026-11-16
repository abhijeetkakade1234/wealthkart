import { describe, expect, it } from "vitest";

import { domainAllowed, verifySigned } from "../src/push/auth";
import { circleList, endpointProblem, subscriptionProblem } from "../src/push/validate";
import { CHAIN, deviceKeys, DOMAIN, ENDPOINT, other, signedMessage, wallet } from "./push-helpers";

const NOW = 1_800_000_000;
const base = { action: "on" as const, endpoint: ENDPOINT, chainId: CHAIN, domains: [DOMAIN] };

describe("push sign-in and input checks (ADR 0052)", () => {
  it("S-REM-10 a fresh, correctly signed message proves the wallet", async () => {
    const s = await signedMessage({ nowSec: NOW });
    const r = await verifySigned({ ...base, ...s, nowSec: NOW + 5 });
    expect(r.ok && r.value.address).toBe(wallet.address.toLowerCase());
  });

  it("S-REM-11 refuses someone else's address, another site, network, device, action, or an expired message", async () => {
    const reasons: string[] = [];
    const check = async (s: { message: string; signature: string }, over = {}) => {
      const r = await verifySigned({ ...base, ...s, nowSec: NOW, ...over });
      expect(r.ok).toBe(false);
      if (!r.ok) reasons.push(r.reason);
    };
    // Claims wallet's address, signed by another key.
    await check(await signedMessage({ nowSec: NOW, signer: other, address: wallet.address }));
    await check(await signedMessage({ nowSec: NOW, domain: "evil.example" }));
    await check(await signedMessage({ nowSec: NOW, chainId: 1 }));
    await check(await signedMessage({ nowSec: NOW, endpoint: `${ENDPOINT}x` }));
    await check(await signedMessage({ nowSec: NOW, action: "off" }));
    await check(await signedMessage({ nowSec: NOW, statement: "Sign in to WealthKart" }));
    await check(await signedMessage({ nowSec: NOW - 400 }));
    await check(await signedMessage({ nowSec: NOW, ttl: 3600 }));
    await check(await signedMessage({ nowSec: NOW + 600 }));
    // Tampered after signing.
    const s = await signedMessage({ nowSec: NOW });
    await check({ ...s, message: s.message.replace("Chain ID: 43113", "Chain ID: 43114") });
    await check({ message: s.message, signature: "0x1234" });
    await check({ message: 42 as unknown as string, signature: s.signature });
    expect(reasons).toContain("The signature doesn't match.");
    expect(reasons).toContain("The signed message is for another site.");
    expect(reasons).toContain("The signed message is for another device.");
    expect(reasons).toContain("The signed message has expired. Try again.");
  });

  it("S-REM-12 allowed sites: exact names and subdomain wildcards only", () => {
    const allowed = ["wealthkart.pages.dev", "*.wealthkart.pages.dev", "127.0.0.1:4310"];
    expect(domainAllowed("wealthkart.pages.dev", allowed)).toBe(true);
    expect(domainAllowed("dev.wealthkart.pages.dev", allowed)).toBe(true);
    expect(domainAllowed("127.0.0.1:4310", allowed)).toBe(true);
    expect(domainAllowed("evilwealthkart.pages.dev", allowed)).toBe(false);
    expect(domainAllowed("wealthkart.pages.dev.evil.com", allowed)).toBe(false);
    expect(domainAllowed("127.0.0.1:4311", allowed)).toBe(false);
    expect(domainAllowed("anything", [])).toBe(false);
  });

  it("S-REM-13 endpoints: only https push services, no logins, odd ports or huge URLs", () => {
    expect(endpointProblem(ENDPOINT)).toBeNull();
    expect(endpointProblem("https://updates.push.services.mozilla.com/wpush/v2/gAAA")).toBeNull();
    expect(endpointProblem("https://web.push.apple.com/QGuQ")).toBeNull();
    expect(endpointProblem("https://wns2-par02p.notify.windows.com/w/?token=x")).toBeNull();
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://example.com/push",
      "https://fcm.googleapis.com.evil.com/x",
      "https://notify.windows.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://169.254.169.254/latest",
      "javascript:alert(1)",
      `https://fcm.googleapis.com/${"a".repeat(1100)}`,
      "",
      42,
    ]) {
      expect(endpointProblem(bad), String(bad).slice(0, 60)).not.toBeNull();
    }
    // E2E allows a local fake push service by prefix, nothing else.
    expect(endpointProblem("http://127.0.0.1:9999/push/1", ["http://127.0.0.1:9999/"])).toBeNull();
    expect(
      endpointProblem("http://127.0.0.1:9998/push/1", ["http://127.0.0.1:9999/"]),
    ).not.toBeNull();
  });

  it("S-REM-14 subscription keys must be a 65-byte P-256 key and a 16-byte secret", async () => {
    const k = await deviceKeys();
    expect(
      subscriptionProblem({ endpoint: ENDPOINT, keys: { p256dh: k.p256dh, auth: k.auth } }),
    ).toBeNull();
    expect(
      subscriptionProblem({ endpoint: ENDPOINT, keys: { p256dh: k.auth, auth: k.auth } }),
    ).not.toBeNull();
    expect(
      subscriptionProblem({ endpoint: ENDPOINT, keys: { p256dh: k.p256dh, auth: "" } }),
    ).not.toBeNull();
    expect(
      subscriptionProblem({ endpoint: ENDPOINT, keys: { p256dh: "!!", auth: k.auth } }),
    ).not.toBeNull();
    expect(subscriptionProblem({ endpoint: ENDPOINT })).not.toBeNull();
    expect(subscriptionProblem(null)).not.toBeNull();
  });

  it("S-REM-15 circle lists keep valid addresses only, lowercased, deduped and capped", () => {
    const a = "0xC1c1000000000000000000000000000000000001";
    expect(circleList([a, a.toLowerCase(), "nope", 7, null], 50)).toEqual([a.toLowerCase()]);
    const many = Array.from({ length: 80 }, (_, i) => `0x${i.toString(16).padStart(40, "0")}`);
    expect(circleList(many, 50)).toHaveLength(50);
    expect(circleList("0xabc", 50)).toEqual([]);
  });
});
