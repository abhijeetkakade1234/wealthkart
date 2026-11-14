import { serializeLd } from "@/lib/seo/json-ld";

/** Renders JSON-LD structured data (docs/seo.md §3). Server component, no client JS. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeLd(data) }} />
  );
}
