-- Lets the admin see what people actually did after signing up, which
-- auth.users can't answer: last_sign_in_at only changes on an explicit
-- sign-in, never when a saved session returns.
--
-- Both tables are service-role only (RLS on, no policies), like
-- trial_extensions/trial_tier_choice — every read/write goes through the API.

-- One row per user: the last time they called the authenticated API (the app
-- loads /billing/subscription on every visit, so opening the app counts).
-- Written at most about once an hour per user by touchLastSeen() in
-- lib/productEvents.ts.
create table if not exists user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table user_activity enable row level security;

-- Append-only event log. trial_started / trial_ended are deliberately NOT
-- events: they're derivable from first_user_uploads + computeTrialStatus(),
-- and nothing runs when a trial lapses, so a logged event would just be a
-- stale copy of something computable.
--   first_upload            first version in a non-sample project (once per user)
--   first_pro_feature_used  first gated write on a non-sample project (once per user)
--   share_created           a share link; user_id null for the anonymous Live Diff tool
--   paywall_viewed          an upgrade prompt shown to a logged-in user; props.surface
create table if not exists product_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  event text not null check (event in ('first_upload', 'first_pro_feature_used', 'share_created', 'paywall_viewed')),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_user_idx on product_events (user_id, created_at desc);
create index if not exists product_events_event_idx on product_events (event, created_at desc);

-- The once-per-user events can't be logged twice even under concurrent
-- requests or an API restart (the in-memory guard in productEvents.ts only
-- saves a round trip).
create unique index if not exists product_events_once
  on product_events (user_id, event)
  where user_id is not null and event in ('first_upload', 'first_pro_feature_used');

alter table product_events enable row level security;

-- Backfill first_upload from what's already recorded, using the original
-- upload time. Idempotent: re-running hits the unique index and does nothing.
insert into product_events (user_id, event, props, created_at)
select u.id, 'first_upload', '{"backfilled": true}'::jsonb, f.first_upload_at
from first_user_uploads f
join auth.users u on u.id::text = f.user_id
on conflict do nothing;

notify pgrst, 'reload schema';
