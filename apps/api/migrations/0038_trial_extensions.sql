-- Lets an admin manually extend (or shorten) a free-tier user's 14-day
-- trial window from /admin/users, independent of computeTrialStatus()'s
-- default created_at + 14 days math (see subscription.ts). Existence is
-- optional and per-user — most users never get a row here; when present,
-- trial_ends_at is used verbatim instead of the default computed date.
-- Same "small admin-override table" convention as demo_accounts (0025)
-- and admin_granted_tier (0037) — this is not a reintroduction of the
-- old default-trial table (see 0013/0014's history, and pro.md), since it
-- only ever holds rows an admin explicitly created, not one per user.
create table trial_extensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_ends_at timestamptz not null,
  granted_by_user_id uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

alter table trial_extensions enable row level security;

notify pgrst, 'reload schema';
