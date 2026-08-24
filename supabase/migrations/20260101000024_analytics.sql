-- Self-hosted, privacy-friendly analytics — replacing Google Analytics
-- (which has had real problems here: a CSP incident silently dropped 100%
-- of hits for weeks, plus Consent Mode fiddliness, plus GA/GTM domains
-- being a common ad-blocker target). Runs alongside GA for now (see plan
-- "Self-hosted privacy-friendly analytics") so the two can be cross-checked
-- before GA is removed.
--
-- Two tables only, by design — both pre-aggregated so a 6-month query is
-- just a date-range WHERE over an already-tiny table, no nightly batch
-- rollup job ever needed:
--   1. analytics_visitor_daily — a daily-rotating hash of IP+UA+day+salt,
--      used solely to dedupe "unique visitor" counts without cookies or
--      storing raw IPs. One row per unique visitor per day, not per
--      pageview.
--   2. analytics_daily_rollup — incremented via upsert per pageview beacon
--      (see netlify/functions/track.mts), across up to 5 dimension rows
--      per event (total + page + country + language + referrer).

create table analytics_visitor_daily (
  visitor_hash text not null,
  day date not null,
  first_seen_at timestamptz not null default now(),
  primary key (day, visitor_hash)
);

create table analytics_daily_rollup (
  day date not null,
  dimension_type text not null check (dimension_type in ('page', 'country', 'language', 'referrer', 'total')),
  dimension_value text not null,
  pageview_count bigint not null default 0,
  visitor_count bigint not null default 0,
  primary key (day, dimension_type, dimension_value)
);

create index analytics_daily_rollup_day_idx on analytics_daily_rollup (day);

-- Service-role only (the Netlify function and the Fastify admin route both
-- use the service-role key, which bypasses RLS) — no anon/authenticated
-- policy is created on purpose. Same lesson as blog_posts shipping once
-- without RLS at all (see 20260101000023_blog_rls.sql) — enable it up
-- front this time instead of as a follow-up fix.
alter table analytics_visitor_daily enable row level security;
alter table analytics_daily_rollup enable row level security;

-- Atomic upsert-increment — supabase-js's .upsert() can't express
-- "set count = count + 1" without a read-then-write race, so the write
-- path (netlify/functions/track.mts) calls this RPC once per dimension
-- row touched by a pageview event instead. security definer + bypassing
-- RLS is fine here: only ever called with the service-role key anyway,
-- same trust boundary as every other RPC in this project (see
-- has_active_team_access's comment in 20260101000017_team_billing.sql).
create or replace function increment_analytics_rollup(
  p_day date,
  p_dimension_type text,
  p_dimension_value text,
  p_new_visitor boolean
) returns void
language sql
security definer
set search_path = public
as $$
  insert into analytics_daily_rollup (day, dimension_type, dimension_value, pageview_count, visitor_count)
  values (p_day, p_dimension_type, p_dimension_value, 1, case when p_new_visitor then 1 else 0 end)
  on conflict (day, dimension_type, dimension_value) do update
  set pageview_count = analytics_daily_rollup.pageview_count + 1,
      visitor_count = analytics_daily_rollup.visitor_count + case when p_new_visitor then 1 else 0 end;
$$;

-- True period-level unique-visitor count — a plain `count: 'exact'` via
-- supabase-js only counts rows, and the same visitor_hash can legitimately
-- appear on multiple days within a range (the dedupe table's key is
-- (day, visitor_hash), not visitor_hash alone), so that would double-count
-- a returning visitor. This is the only correct way to answer "how many
-- distinct people visited in this date range" from this schema.
create or replace function count_distinct_visitors(p_from date, p_to date) returns bigint
language sql
security definer
set search_path = public
as $$
  select count(distinct visitor_hash) from analytics_visitor_daily where day between p_from and p_to;
$$;

notify pgrst, 'reload schema';
