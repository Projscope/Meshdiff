const explicitApiUrl = import.meta.env.VITE_API_URL as string | undefined;

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
