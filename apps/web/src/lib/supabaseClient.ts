import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY are not set — auth and Projects will not work.",
  );
}

// createClient throws synchronously on an empty/invalid URL, which would
// crash the whole app at import time (before React even renders) — Live
// Diff must keep working even when these env vars aren't configured, so
// fall back to a syntactically valid placeholder that only fails at
// actual network-call time, not at import time.
/** Anon-key client for auth (sign in/up/out, session). Never use the service-role key here. */
export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder");
