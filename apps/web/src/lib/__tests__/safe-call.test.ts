// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { messages } from "../messages";
import { safeCall } from "../safe-call";

const never = () => new Promise<never>(() => {});

describe("safeCall", () => {
  it("S-UX-06 RPC times out -> one retry -> fallback times out -> friendly timeout error, never throws", async () => {
    const primary = vi.fn(never);
    const fallback = vi.fn(never);
    const onAttemptError = vi.fn();

    const result = await safeCall(primary, {
      timeoutMs: 20,
      backoffMs: 5,
      fallback,
      onAttemptError,
    });

    expect(primary).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(onAttemptError).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("timeout");
      expect(result.error.message).toBe(messages.timeout());
      expect(result.error.message).not.toMatch(/ms|Error/);
    }
  });

  it("S-UX-06 primary times out twice, fallback RPC answers", async () => {
    const result = await safeCall(never, {
      timeoutMs: 20,
      backoffMs: 5,
      fallback: async () => 42,
    });
    expect(result).toEqual({ ok: true, data: 42, source: "fallback" });
  });

  it("S-UX-06 retry succeeds after a transient network error", async () => {
    const primary = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce("block 123");
    const result = await safeCall(primary, { timeoutMs: 100, backoffMs: 5 });
    expect(primary).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, data: "block 123", source: "primary" });
  });

  it("S-UX-06 user rejection is not retried and not sent to the fallback", async () => {
    const primary = vi.fn(() =>
      Promise.reject({ code: 4001, message: "User rejected the request." }),
    );
    const fallback = vi.fn(async () => "never used");
    const result = await safeCall(primary, { timeoutMs: 100, backoffMs: 5, fallback });
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe(messages.userRejected());
  });

  it("S-UX-06 a synchronous throw and a thrown non-Error still resolve to a friendly error", async () => {
    const result = await safeCall(
      () => {
        throw "weird string";
      },
      { timeoutMs: 50, backoffMs: 1, retries: 0 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown");
      expect(result.error.message).toBe(messages.unknown());
      expect(result.error.details).toContain("weird string");
    }
  });

  it("S-UX-06 aborts the timed-out attempt's signal", async () => {
    let seen: AbortSignal | undefined;
    await safeCall(
      (signal) => {
        seen = signal;
        return never();
      },
      { timeoutMs: 10, retries: 0 },
    );
    expect(seen?.aborted).toBe(true);
  });
});
