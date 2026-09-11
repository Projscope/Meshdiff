-- Lets a free-tier user, while trialing, choose to trial Team instead of
-- the default Pro-level access (see the modal in TrialTierChoiceModal.tsx)
-- — a real functional unlock via getUserTier() in subscription.ts, not
-- cosmetic copy. Existence = flagged, same minimal-table convention as
-- demo_accounts (0025): a row only ever exists for "chose Team", so 'pro'
-- (the default) is simply the absence of a row, not a stored value.
create table trial_tier_choice (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null check (tier in ('team')),
  chosen_at timestamptz not null default now()
);

alter table trial_tier_choice enable row level security;

notify pgrst, 'reload schema';
