-- Adds 'device' to the analytics dimension_type enum (see 0024) — tracked
-- server-side in netlify/functions/track.mts from the User-Agent header
-- (mobile/tablet/desktop), same pre-aggregated rollup pattern as every
-- other dimension. No new table needed.

alter table analytics_daily_rollup drop constraint if exists analytics_daily_rollup_dimension_type_check;
alter table analytics_daily_rollup add constraint analytics_daily_rollup_dimension_type_check
  check (dimension_type in ('page', 'country', 'language', 'referrer', 'total', 'device'));
