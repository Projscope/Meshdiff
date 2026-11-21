export interface CloudConfig {
  /** The Meshdiff API, e.g. https://meshdiff-api.onrender.com */
  apiUrl: string;
  /** The Supabase project that holds accounts. */
  supabaseUrl: string;
  /** Supabase's public (anon) key: safe to ship, it only identifies the project. */
  supabaseAnonKey: string;
}

/** Values baked in at build time (scripts/build.mjs). Empty in a plain development build. */
declare const __MESHDIFF_API_URL__: string | undefined;
declare const __MESHDIFF_SUPABASE_URL__: string | undefined;
declare const __MESHDIFF_SUPABASE_ANON_KEY__: string | undefined;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function bakedConfig(): Partial<CloudConfig> {
  return {
    apiUrl: typeof __MESHDIFF_API_URL__ === "string" ? __MESHDIFF_API_URL__ : undefined,
    supabaseUrl: typeof __MESHDIFF_SUPABASE_URL__ === "string" ? __MESHDIFF_SUPABASE_URL__ : undefined,
    supabaseAnonKey: typeof __MESHDIFF_SUPABASE_ANON_KEY__ === "string" ? __MESHDIFF_SUPABASE_ANON_KEY__ : undefined,
  };
}

/**
 * Where the cloud lives. Environment variables win over the build-time values so
 * a developer can point a build at a local stack. Returns null when any piece is
 * missing: the app then runs fully locally and says syncing isn't set up.
 */
export function resolveCloudConfig(
  env: Record<string, string | undefined> = process.env,
  baked: Partial<CloudConfig> = bakedConfig(),
): CloudConfig | null {
  const apiUrl = env.MESHDIFF_API_URL || baked.apiUrl;
  const supabaseUrl = env.MESHDIFF_SUPABASE_URL || baked.supabaseUrl;
  const supabaseAnonKey = env.MESHDIFF_SUPABASE_ANON_KEY || baked.supabaseAnonKey;
  if (!apiUrl || !supabaseUrl || !supabaseAnonKey) return null;
  return { apiUrl: stripTrailingSlash(apiUrl), supabaseUrl: stripTrailingSlash(supabaseUrl), supabaseAnonKey };
}
