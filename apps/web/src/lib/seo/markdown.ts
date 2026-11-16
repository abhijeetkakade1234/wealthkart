import { PUBLIC_PAGES, type Block, type PublicPage } from "@/content/pages";
import { landingToMarkdown } from "@/content/landing";
import { SITE_NAME, SITE_SUMMARY, absoluteUrl } from "@/content/site";

function blockToMarkdown(block: Block): string {
  switch (block.kind) {
    case "p":
      return block.text;
    case "list":
      return block.items.map((i) => `- ${i}`).join("\n");
    case "steps":
      return block.items.map((s, i) => `${i + 1}. **${s.title}.** ${s.text}`).join("\n");
    case "table": {
      const row = (cells: string[]) =>
        `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
      return [row(block.head), row(block.head.map(() => "---")), ...block.rows.map(row)].join("\n");
    }
  }
}

/** Markdown twin of a public page (`/how-it-works.md`), same content as the HTML. */
export function pageToMarkdown(page: PublicPage): string {
  const parts = [
    `# ${page.h1}`,
    `> ${page.description}`,
    page.intro,
    `Source: ${absoluteUrl(page.path)} · Updated ${page.updated}`,
  ];
  for (const s of page.sections) {
    parts.push(`## ${s.heading}`, s.answer, ...(s.blocks ?? []).map(blockToMarkdown));
  }
  return `${parts.join("\n\n")}\n`;
}

/** Path of a page's Markdown twin: "/faq/" → "/faq.md". */
export function markdownPath(page: PublicPage): string {
  return `/${page.slug}.md`;
}

const LLMS_BLURB: Record<string, string> = {
  "how-it-works": "creating a circle, monthly contributions, loans by vote, exits",
  rules: "every circle setting with default values and limits",
  security: "immutable contracts, custody, status and contract addresses",
  faq: "common questions",
};

/** `/llms.txt` in the llms.txt format (docs/seo.md §4). */
export function llmsTxt(): string {
  const docs = PUBLIC_PAGES.map(
    (p) =>
      `- [${p.eyebrow}](${absoluteUrl(markdownPath(p))}): ${LLMS_BLURB[p.slug] ?? p.description}`,
  );
  return [
    `# ${SITE_NAME}`,
    `> ${SITE_SUMMARY}`,
    "## Docs",
    docs.join("\n"),
    "## Optional",
    `- [Full docs](${absoluteUrl("/llms-full.txt")})`,
  ]
    .join("\n\n")
    .concat("\n");
}

/** `/llms-full.txt`: the landing page, then every public page, as Markdown. */
export function llmsFullTxt(): string {
  return [
    `# ${SITE_NAME}\n\n> ${SITE_SUMMARY}\n`,
    `Source: ${absoluteUrl("/")}\n\n${landingToMarkdown()}`,
    ...PUBLIC_PAGES.map(pageToMarkdown),
  ].join("\n---\n\n");
}
