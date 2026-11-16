import { ArrowRight } from "lucide-react";

import type { RuleChange } from "@/lib/rules";

/** Changed settings as "label: before -> after", one per row. */
export function RuleDiffList({ changes }: { changes: RuleChange[] }) {
  if (changes.length === 0) {
    return <p className="text-[13.5px] text-muted-foreground">No setting changes.</p>;
  }
  return (
    <ul
      className="grid divide-y divide-line-soft rounded-[12px] border border-line-soft"
      data-testid="rule-diff"
    >
      {changes.map((c) => (
        <li
          key={c.key}
          className="grid gap-1.5 px-5 py-3.5 text-[13.5px] sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
        >
          <span className="text-foreground">{c.label}</span>
          <span className="inline-flex flex-wrap items-center gap-2 font-mono text-[13px] tabular">
            <span className="text-muted-foreground line-through decoration-faint">{c.before}</span>
            <ArrowRight className="size-3.5 text-faint" strokeWidth={1.5} aria-label="becomes" />
            <span className="font-semibold text-brand">{c.after}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
