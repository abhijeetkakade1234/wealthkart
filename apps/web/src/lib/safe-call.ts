/**
 * One wrapper for every chain, RPC and indexer call (docs/ui.md §11).
 *
 * - timeout per attempt (aborts the attempt's AbortSignal)
 * - one retry with backoff for transient failures (network, timeout, unknown)
 * - optional fallback (e.g. a second RPC) once the primary gives up
 * - never throws: the result is `{ ok: true, data }` or `{ ok: false, error: FriendlyError }`
 */
import {
  type FriendlyError,
  type FriendlyErrorContext,
  isRetryable,
  toFriendlyError,
} from "./messages";

export type SafeResult<T> =
  { ok: true; data: T; source: "primary" | "fallback" } | { ok: false; error: FriendlyError };

export interface SafeCallOptions<T> {
  /** Per-attempt timeout. Default 10 s. */
  timeoutMs?: number;
  /** Extra attempts on transient failures. Default 1 (so at most 2 primary attempts). */
  retries?: number;
  /** Wait before the first retry; doubles each retry. Default 400 ms. */
  backoffMs?: number;
  /** Tried once after the primary gives up on a transient failure (e.g. fallback RPC). */
  fallback?: (signal: AbortSignal) => Promise<T>;
  /** Facts that make the friendly message specific (amounts, month, cap). */
  context?: FriendlyErrorContext;
  /** Called with the raw error of every failed attempt, for logging. */
  onAttemptError?: (error: unknown, attempt: number) => void;
}

export class SafeCallTimeoutError extends Error {
  override name = "TimeoutError";
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new SafeCallTimeoutError(ms);
      controller.abort(err);
      reject(err);
    }, ms);
  });
  try {
    // `Promise.resolve().then` turns a synchronous throw into a rejection.
    return await Promise.race([Promise.resolve().then(() => fn(controller.signal)), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function safeCall<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: SafeCallOptions<T> = {},
): Promise<SafeResult<T>> {
  const {
    timeoutMs = 10_000,
    retries = 1,
    backoffMs = 400,
    fallback,
    context,
    onAttemptError,
  } = options;

  let lastError: FriendlyError | undefined;
  let attempt = 0;

  for (let i = 0; i <= retries; i++) {
    attempt++;
    try {
      const data = await withTimeout(fn, timeoutMs);
      return { ok: true, data, source: "primary" };
    } catch (raw) {
      onAttemptError?.(raw, attempt);
      lastError = toFriendlyError(raw, context);
      if (!isRetryable(lastError.code)) return { ok: false, error: lastError };
      if (i < retries) await sleep(backoffMs * 2 ** i);
    }
  }

  if (fallback) {
    attempt++;
    try {
      const data = await withTimeout(fallback, timeoutMs);
      return { ok: true, data, source: "fallback" };
    } catch (raw) {
      onAttemptError?.(raw, attempt);
      lastError = toFriendlyError(raw, context);
    }
  }

  return { ok: false, error: lastError ?? toFriendlyError(undefined, context) };
}
