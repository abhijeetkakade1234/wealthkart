import type { Block, PublicPage } from "@/content/pages";
import { pageLd } from "@/lib/seo/json-ld";

import { JsonLd } from "./json-ld";

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return <p className="text-[16px] leading-[1.75] text-muted-foreground">{block.text}</p>;
    case "list":
      return (
        <ul className="flex flex-col gap-3 text-[16px] leading-[1.7] text-muted-foreground">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-brand" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="flex flex-col gap-6">
          {block.items.map((step, i) => (
            <li key={step.title} className="flex gap-5">
              <span className="font-mono text-[13px] leading-[1.9] text-brand">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-[16px] font-semibold">{step.title}</p>
                <p className="mt-1.5 text-[15.5px] leading-[1.7] text-muted-foreground">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-[14px] border border-border">
          <table className="w-full min-w-[520px] text-left text-[14.5px]">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {block.head.map((h) => (
                  <th key={h} scope="col" className="px-5 py-3.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]} className="border-b border-line-soft last:border-0">
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      className={
                        i === 0
                          ? "px-5 py-3.5"
                          : "break-all px-5 py-3.5 font-mono text-[13px] text-muted-foreground"
                      }
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/**
 * A public help page rendered from `content/pages.ts`: one h1, question-style h2s with a
 * direct answer first (GEO, docs/seo.md §3), JSON-LD, and wide margins (ADR 0025).
 */
export function PublicArticle({ page }: { page: PublicPage }) {
  return (
    <main className="mx-auto max-w-[1180px] px-4 sm:px-10">
      <JsonLd data={pageLd(page)} />
      <header className="max-w-[760px] pb-16 pt-16 sm:pt-28">
        <p className="text-xs uppercase tracking-[0.14em] text-brand">{page.eyebrow}</p>
        <h1 className="mt-6 font-display text-[clamp(38px,5vw,64px)] leading-[1.02] tracking-tight">
          {page.h1}
        </h1>
        <p className="mt-7 text-[17.5px] leading-relaxed text-muted-foreground">{page.intro}</p>
        <p className="mt-6 text-[13px] text-muted-foreground">Updated {formatDate(page.updated)}</p>
      </header>

      <div className="flex max-w-[760px] flex-col gap-20 border-t border-line-soft pt-16">
        {page.sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24">
            <h2
              id={`${s.id}-h`}
              className="font-display text-[clamp(26px,3vw,34px)] leading-tight tracking-tight"
            >
              {s.heading}
            </h2>
            <p className="mt-5 text-[17px] leading-[1.7]">{s.answer}</p>
            {s.blocks && s.blocks.length > 0 && (
              <div className="mt-8 flex flex-col gap-6">
                {s.blocks.map((b, i) => (
                  <BlockView key={i} block={b} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
