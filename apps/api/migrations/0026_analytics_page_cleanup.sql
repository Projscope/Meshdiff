-- One-time data cleanup for two page-tracking issues fixed in
-- netlify/functions/track.mts (path normalization) and
-- apps/web/src/hooks/useTrackPageview.ts (/projects exclusion) — this
-- migration only cleans up rows already written under the old behavior;
-- it doesn't change how future pageviews are recorded.
--
-- 1. /projects/* is the signed-in app itself (project/version IDs in the
--    URL), not a public page — never useful in a "top pages" breakdown,
--    and every distinct project ID was showing up as its own row. Delete
--    every page-dimension row already recorded for it.
delete from analytics_daily_rollup
where dimension_type = 'page'
  and (dimension_value = '/projects' or dimension_value like '/projects/%');

-- 2. "/features" and "/features/" (and every other page) are the same
--    page, but track.mts didn't strip a trailing slash before this fix, so
--    they landed as two separate rows depending on how the link was
--    typed/clicked. Merge every trailing-slash variant's counts into its
--    canonical (no trailing slash) row, per day — "/" itself is exempt,
--    it has no non-slash form.
insert into analytics_daily_rollup (day, dimension_type, dimension_value, pageview_count, visitor_count)
select day, dimension_type, left(dimension_value, length(dimension_value) - 1), pageview_count, visitor_count
from analytics_daily_rollup
where dimension_type = 'page' and dimension_value <> '/' and dimension_value like '%/'
on conflict (day, dimension_type, dimension_value) do update
set pageview_count = analytics_daily_rollup.pageview_count + excluded.pageview_count,
    visitor_count = analytics_daily_rollup.visitor_count + excluded.visitor_count;

delete from analytics_daily_rollup
where dimension_type = 'page' and dimension_value <> '/' and dimension_value like '%/';

notify pgrst, 'reload schema';
