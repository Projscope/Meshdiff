-- Lets an admin flag a user as a "demo" account (a seeded/test/showcase
-- account) so it's excluded from the admin user-count widgets — Total
-- Users, Conversion Rate, the Free/Trialing/Pro/Team breakdown, and the
-- signups trend chart (see getAdminStats()/getSignupBuckets() in
-- apps/api/src/lib/adminStats.ts). The account itself is completely
-- unaffected — this only changes what counts in aggregate stats, not
-- access, billing, or anything the account itself can do.
--
-- One row per flagged user, existence = flagged (no boolean column to keep
-- in sync). Deleting the auth user cleans this up automatically.
create table demo_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Service-role only — the Fastify admin routes are the only caller, using
-- the service-role key, which bypasses RLS. No anon/authenticated policy
-- on purpose (same lesson as blog_posts shipping once without RLS at all,
-- see 20260101000023_blog_rls.sql — enable it up front instead of as a
-- follow-up fix).
alter table demo_accounts enable row level security;

notify pgrst, 'reload schema';
