import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductEvent = "first_upload" | "first_pro_feature_used" | "share_created" | "paywall_viewed";

// Logged once per user ever — the DB's unique index is the real guarantee;
// this set only saves a round trip on every later request in this process.
const ONCE_EVENTS = new Set<ProductEvent>(["first_upload", "first_pro_feature_used"]);
const recordedOnce = new Set<string>();

const lastSeenTouchedAt = new Map<string, number>();
export const LAST_SEEN_INTERVAL_MS = 3_600_000;

/** Fire-and-forget: never awaited by callers and never throws, so tracking
 * can't slow or break the request it rides on. Also tolerates the tables
 * not existing yet (an API deployed ahead of its migration just logs). */
export function recordEvent(
  supabase: SupabaseClient,
  userId: string | null,
  event: ProductEvent,
  props: Record<string, unknown> = {},
): void {
  const onceKey = userId && ONCE_EVENTS.has(event) ? `${userId}:${event}` : null;
  if (onceKey) {
    if (recordedOnce.has(onceKey)) return;
    recordedOnce.add(onceKey);
  }
  void (async () => {
    try {
      const { error } = await supabase.from("product_events").insert({ user_id: userId, event, props });
      // 23505 = already logged (the once-per-user unique index) — expected.
      if (error && error.code !== "23505") {
        if (onceKey) recordedOnce.delete(onceKey);
        console.warn(`product_events insert failed (${event}): ${error.message}`);
      }
    } catch (err) {
      if (onceKey) recordedOnce.delete(onceKey);
      console.warn(`product_events insert threw (${event}):`, err);
    }
  })();
}

/** Stamps user_activity.last_seen_at, at most once per LAST_SEEN_INTERVAL_MS
 * per user per process (a restart just allows one extra write per user). */
export function touchLastSeen(supabase: SupabaseClient, userId: string): void {
  const now = Date.now();
  const previous = lastSeenTouchedAt.get(userId);
  if (previous !== undefined && now - previous < LAST_SEEN_INTERVAL_MS) return;
  lastSeenTouchedAt.set(userId, now);
  void (async () => {
    try {
      const { error } = await supabase
        .from("user_activity")
        .upsert({ user_id: userId, last_seen_at: new Date(now).toISOString() }, { onConflict: "user_id" });
      if (error) {
        backOffLastSeen(userId, now);
        console.warn(`user_activity upsert failed: ${error.message}`);
      }
    } catch (err) {
      backOffLastSeen(userId, now);
      console.warn("user_activity upsert threw:", err);
    }
  })();
}

// After a failed write, retry in LAST_SEEN_RETRY_MS instead of on the very
// next request — otherwise a missing table (API deployed before its
// migration) would add a failing query and a log line to every call.
const LAST_SEEN_RETRY_MS = 300_000;
function backOffLastSeen(userId: string, now: number): void {
  lastSeenTouchedAt.set(userId, now - LAST_SEEN_INTERVAL_MS + LAST_SEEN_RETRY_MS);
}

/** Bulk lookup for the admin users list — one query instead of one per row. */
export async function getLastSeenByUser(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase.from("user_activity").select("user_id, last_seen_at").in("user_id", userIds);
  // Display-only column: if the table isn't there yet, the page still loads.
  if (error || !data) return new Map();
  return new Map((data as Array<{ user_id: string; last_seen_at: string }>).map((r) => [r.user_id, r.last_seen_at]));
}
