// UI convenience only — hides admin-only links/sections for everyone else.
// The real admin boundary is server-side (apps/api/src/lib/requireAdmin.ts's
// own ADMIN_EMAILS), so a non-admin hitting /admin directly still gets a
// 403 from the API regardless of what this shows or hides.
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
