/**
 * Where to go after signing in. Only app paths on this site are allowed, so a crafted
 * `?next=` link can't bounce someone to another website (open-redirect guard).
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/app/";
  if (!raw.startsWith("/app/") || raw.startsWith("//") || raw.includes("\\")) return "/app/";
  return raw;
}

/** Login URL that returns to `path` (pathname plus search) afterwards. */
export function loginHref(path: string): string {
  return `/login/?next=${encodeURIComponent(safeNext(path))}`;
}
