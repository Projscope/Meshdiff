/**
 * Whether an ISO timestamp is in the past relative to `now` (defaults to
 * the current time). Used to decide whether a share link has expired.
 *
 * The actual expiration check lives server-side (apps/api/src/routes/share.ts
 * and netlify/functions/share-get.mts each re-implement this same one-line
 * comparison, per this repo's established dual-implementation convention —
 * see waitlist.ts / waitlist.mts). This copy is kept testable in the one
 * workspace that has a test runner.
 */
export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
