const explicitApiUrl = import.meta.env.VITE_API_URL as string | undefined;

/**
 * Base URL for the Projects API surface (too many routes/dynamic paths to
 * mirror individually as Netlify Functions the way waitlist/share do).
 * Production deployment of these routes needs a real hosted Fastify
 * server (CLAUDE.md: Render/Railway), not Netlify Functions — set
 * VITE_API_URL once that's live.
 */
export const API_BASE_URL = explicitApiUrl ?? (import.meta.env.DEV ? "http://localhost:3001" : "");

/**
 * Local dev talks to the real Fastify server (apps/api). Production has
 * no separately hosted backend — the waitlist endpoint is a Netlify
 * Function deployed alongside the static site (netlify/functions/waitlist.mts),
 * reachable same-origin. VITE_API_URL overrides both if set explicitly.
 */
export const WAITLIST_ENDPOINT = explicitApiUrl
  ? `${explicitApiUrl}/waitlist`
  : import.meta.env.DEV
    ? "http://localhost:3001/waitlist"
    : "/.netlify/functions/waitlist";

export const SHARE_CREATE_ENDPOINT = explicitApiUrl
  ? `${explicitApiUrl}/share`
  : import.meta.env.DEV
    ? "http://localhost:3001/share"
    : "/.netlify/functions/share-create";

export function shareGetEndpoint(id: string): string {
  if (explicitApiUrl) return `${explicitApiUrl}/share/${id}`;
  return import.meta.env.DEV
    ? `http://localhost:3001/share/${id}`
    : `/.netlify/functions/share-get?id=${id}`;
}
