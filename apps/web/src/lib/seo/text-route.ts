/** Plain-text response for build-time text routes (llms.txt, page `.md` twins). */
export function textResponse(body: string, type: "text/plain" | "text/markdown"): Response {
  return new Response(body, { headers: { "Content-Type": `${type}; charset=utf-8` } });
}
