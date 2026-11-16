import { PublicFrame } from "@/components/public/public-frame";

/**
 * Shared layout for the English public pages (/, how-it-works, rules, security, faq, start,
 * legal): calm header, generous whitespace, footer with every public link, the language row
 * and llms.txt (ADR 0024, ADR 0025, ADR 0057). `/hi/` and `/mr/` use the same frame from
 * `app/[lang]/layout.tsx`. No wallet code loads here, so public pages stay light.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicFrame locale="en">{children}</PublicFrame>;
}
