"use client";

import { useEffect, useState } from "react";

import { useT } from "@/i18n/react";

import { formatTimeLeft, localDeadline, UTC_FORMAT } from "./countdown-utc";

/**
 * Any on-chain deadline (seconds) in UTC and the viewer's time, with time left (ADR 0014).
 * `chainNow` is the latest block time; the countdown ticks from it so it agrees with the
 * contract even when the device clock is off.
 */
export function Deadline({
  deadline,
  chainNow,
  prefix,
  pastText,
}: {
  deadline: number;
  chainNow: number;
  /** Words before the date; defaults to "Voting ends". */
  prefix?: string;
  /** Shown instead of the countdown once the moment has passed. */
  pastText?: string;
}) {
  const [drift, setDrift] = useState(0);
  const { t, locale, formatDate } = useT();
  useEffect(() => {
    const started = Date.now();
    setDrift(0);
    const t = setInterval(() => setDrift(Math.floor((Date.now() - started) / 1000)), 30_000);
    return () => clearInterval(t);
  }, [chainNow]);

  const now = chainNow + drift;
  const local = localDeadline(deadline, locale);
  const left = deadline - now;

  return (
    <span className="font-mono text-[12px] leading-relaxed text-muted-foreground">
      {prefix ?? t("kit.votingEnds")}{" "}
      <strong className="font-semibold text-foreground">
        {t("kit.utcTime", { time: formatDate(new Date(deadline * 1000), UTC_FORMAT) })}
      </strong>
      <br />
      {t("kit.yourTime", {
        local,
        left: left >= 0 ? formatTimeLeft(left) : (pastText ?? t("kit.votingOver")),
      })}
    </span>
  );
}
