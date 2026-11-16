"use client";

import { dueMoment } from "@wealthkart/rules";
import { useEffect, useState } from "react";

import type { Locale } from "@/i18n/config";
import { useT } from "@/i18n/react";
import { intlLocale, t } from "@/i18n/runtime";

/** "2d 4h left" / "3h 12m left" / "overdue by 1d 2h" */
export function formatTimeLeft(secondsLeft: number): string {
  const overdue = secondsLeft < 0;
  let s = Math.abs(secondsLeft);
  const d = Math.floor(s / 86_400);
  s -= d * 86_400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const parts =
    d > 0
      ? t("kit.daysHours", { d, h })
      : h > 0
        ? t("kit.hoursMinutes", { h, m })
        : t("kit.minutesOnly", { m });
  return overdue ? t("kit.overdueBy", { parts }) : t("kit.timeLeft", { parts });
}

/** Deadline in UTC, as the contract counts it (ADR 0014). English keeps "en-GB". */
export const UTC_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
};

/** The same moment in the viewer's own time zone: device locale in English, else hi-IN / mr-IN. */
export function localDeadline(seconds: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? undefined : intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(seconds * 1000));
}

/**
 * Deadline shown in UTC (what the contract uses) and in the viewer's own time,
 * with a live countdown (ADR 0014, S-WEB-11).
 */
export function CountdownUTC({ period, dueDay }: { period: number; dueDay: number }) {
  const deadline = dueMoment(period, dueDay);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const { t: tr, locale, formatDate } = useT();

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  const local = localDeadline(deadline, locale);

  return (
    <span className="font-mono text-[12px] leading-relaxed text-muted-foreground">
      {tr("kit.due")}{" "}
      <strong className="font-semibold text-foreground">
        {tr("kit.utcTime", { time: formatDate(new Date(deadline * 1000), UTC_FORMAT) })}
      </strong>
      <br />
      {tr("kit.yourTime", { local, left: formatTimeLeft(deadline - now) })}
    </span>
  );
}
