"use client";

import { dueMoment } from "@wealthkart/rules";
import { useEffect, useState } from "react";

/** "2d 4h left" / "3h 12m left" / "overdue by 1d 2h" */
export function formatTimeLeft(secondsLeft: number): string {
  const overdue = secondsLeft < 0;
  let s = Math.abs(secondsLeft);
  const d = Math.floor(s / 86_400);
  s -= d * 86_400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const parts = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return overdue ? `overdue by ${parts}` : `${parts} left`;
}

const utcFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/**
 * Deadline shown in UTC (what the contract uses) and in the viewer's own time,
 * with a live countdown (ADR 0014, S-WEB-11).
 */
export function CountdownUTC({ period, dueDay }: { period: number; dueDay: number }) {
  const deadline = dueMoment(period, dueDay);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  const local = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(deadline * 1000));

  return (
    <span className="font-mono text-[12px] leading-relaxed text-muted-foreground">
      Due{" "}
      <strong className="font-semibold text-foreground">
        {utcFmt.format(new Date(deadline * 1000))} UTC
      </strong>
      <br />
      Your time: {local} · {formatTimeLeft(deadline - now)}
    </span>
  );
}
