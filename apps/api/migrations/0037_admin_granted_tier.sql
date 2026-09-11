-- Lets an admin manually grant Pro/Team access to any account, independent
-- of Stripe — e.g. comps, support cases, or testing without a real card.
-- Existence + a tier column, same "flag" convention as demo_accounts
-- (0025_demo_accounts.sql). Checked in getUserTier() before the real
-- subscriptions table (see subscription.ts), so a grant here takes
-- priority and needs no actual Stripe subscription row to work — the
-- account's real billing (if any) is completely untouched, this is purely
-- an additional floor.
create table admin_granted_tier (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null check (tier in ('pro', 'team')),
  granted_by_user_id uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

-- Service-role only, same convention as demo_accounts — no anon/authenticated
-- policy is created on purpose.
alter table admin_granted_tier enable row level security;

notify pgrst, 'reload schema';
