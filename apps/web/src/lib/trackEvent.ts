import { useEffect } from "react";
import { request } from "./projectsApi";
import { IS_DESKTOP } from "./runtime";

// Module-level, so a prompt that mounts/unmounts repeatedly in one visit is
// reported once. The server also caps it at one per user per surface per hour.
const reported = new Set<string>();

/** Records that a logged-in user was shown an upgrade prompt. `surface` is a
 * short snake_case name for where (e.g. "manage_plan"). Fire-and-forget:
 * failures are ignored so tracking never affects the page. */
export function usePaywallViewed(surface: string, active = true): void {
  useEffect(() => {
    if (IS_DESKTOP || !active || reported.has(surface)) return;
    reported.add(surface);
    void request("/events", { method: "POST", body: JSON.stringify({ event: "paywall_viewed", surface }) });
  }, [surface, active]);
}
