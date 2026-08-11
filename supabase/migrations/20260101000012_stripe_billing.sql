-- Stripe billing for the Pro tier. Payment plumbing only (checkout, webhook
-- processing, and a way to read "is this user Pro") — no gating anywhere
-- yet, that's a deliberately separate follow-up. There's no custom `users`
-- table (auth is 100% Supabase, see 0002), so Stripe identity attaches
-- directly to auth.users via these two tables rather than a column on a
-- table that doesn't exist.

create table if not exists stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired')),
  tier text not null check (tier in ('pro')), -- 'team' added in a future pass
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One subscription row per user — sufficient for single-tier Pro, upserted
-- by the webhook handler on user_id.
create unique index if not exists subscriptions_user_id_idx on subscriptions(user_id);
create index if not exists subscriptions_stripe_subscription_id_idx on subscriptions(stripe_subscription_id);

alter table stripe_customers enable row level security;
alter table subscriptions enable row level security;

-- Defense-in-depth only, same convention as 0006's team policies (see that
-- migration's comment: the API's service-role key bypasses RLS; only the
-- webhook handler ever writes these tables). Users can read their own rows,
-- nothing else — no insert/update/delete policy for either table.
create policy "Users view their own stripe customer row" on stripe_customers
  for select using (user_id = auth.uid());

create policy "Users view their own subscription" on subscriptions
  for select using (user_id = auth.uid());

notify pgrst, 'reload schema';
