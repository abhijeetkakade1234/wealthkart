"use client";

import { Table2, LineChart as LineIcon } from "lucide-react";
import { useState } from "react";

import { useT } from "@/i18n/react";
import "@/i18n/en/analytics";

/**
 * Card around one chart: title, one-line explanation, and a "Table" toggle so every chart
 * can also be read as numbers (dataviz: a table view always exists).
 */
export function ChartFrame({
  title,
  subtitle,
  table,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  /** Column headers and rows, already formatted for reading. */
  table: { columns: string[]; rows: string[][] };
  children: React.ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const { t } = useT();
  return (
    <section
      className={`grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8 ${className ?? ""}`}
      aria-label={title}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <h3 className="font-display text-[24px] leading-none tracking-tight">{title}</h3>
          <p className="text-[13.5px] text-muted-foreground">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {asTable ? (
            <LineIcon className="size-3.5" strokeWidth={1.75} aria-hidden />
          ) : (
            <Table2 className="size-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {asTable ? t("analytics.chart") : t("analytics.table")}
        </button>
      </header>
      {asTable ? (
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[12.5px] text-muted-foreground">
                {table.columns.map((c, i) => (
                  <th key={c} className={`py-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r[0]} className="border-b border-line-soft last:border-0">
                  {r.map((cell, i) => (
                    <td key={i} className={`py-2 ${i > 0 ? "text-right tabular" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
