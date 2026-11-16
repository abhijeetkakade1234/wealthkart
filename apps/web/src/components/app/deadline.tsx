"use client";

import { useEffect, useState } from "react";

import { formatTimeLeft } from "./countdown-utc";

const utcFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/**
 * Any on-chain deadline (seconds) in UTC and the viewer's time, with time left (ADR 0014).
 * `chainNow` is the latest block time; the countdown ticks from it so it agrees with the
 * contract even when the device clock is off.
 */
export function Deadline({
  deadline,
  chainNow,
  prefix = "Voting ends",
  pastText = "voting time is over",
}: {
  deadline: number;
  chainNow: number;
  prefix?: string;
  /** Shown instead of the countdown once the moment has passed. */
  pastText?: string;
}) {
  const [drift, setDrift] = useState(0);
  useEffect(() => {
    const started = Date.now();
    setDrift(0);
    const t = setInterval(() => setDrift(Math.floor((Date.now() - started) / 1000)), 30_000);
    return () => clearInterval(t);
  }, [chainNow]);

  const now = chainNow + drift;
  const local = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(deadline * 1000));
  const left = deadline - now;

  return (
    <span className="font-mono text-[12px] leading-relaxed text-muted-foreground">
      {prefix}{" "}
      <strong className="font-semibold text-foreground">
        {utcFmt.format(new Date(deadline * 1000))} UTC
      </strong>
      <br />
      Your time: {local} · {left >= 0 ? formatTimeLeft(left) : pastText}
    </span>
  );
}
