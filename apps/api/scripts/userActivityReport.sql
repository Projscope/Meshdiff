-- What each account actually did after signing up. Read-only; run in the
-- Supabase SQL editor. Exclude your own/demo accounts when reading it.
--
-- last_seen_at and the product_events columns only count from the day
-- migration 0041 was deployed; older activity shows up only through uploads,
-- comments and session refreshes.
with up as (
  select v.uploaded_by_user_id::text as uid,
         count(*) filter (where not p.is_sample) as uploads,
         max(v.created_at) filter (where not p.is_sample) as last_upload
  from versions v join projects p on p.id = v.project_id
  group by 1
),
cm as (
  select author_user_id::text as uid, count(*) as comments, max(created_at) as last_comment
  from comments group by 1
),
se as (
  select user_id::text as uid,
         max(greatest(refreshed_at at time zone 'utc', updated_at)) as last_session
  from auth.sessions group by 1
),
ev as (
  select user_id::text as uid,
         count(*) filter (where event = 'share_created') as shares,
         count(*) filter (where event = 'paywall_viewed') as paywall_views,
         min(created_at) filter (where event = 'first_pro_feature_used') as first_pro_feature_at
  from product_events where user_id is not null group by 1
)
select u.email,
       u.created_at                                   as signed_up,
       f.first_upload_at                              as trial_clock_started_at,
       case when te.user_id is not null then 'admin override'
            when f.first_upload_at is not null then 'uploaded: 14d from first upload'
            else 'no upload: 30d from signup' end     as trial_branch,
       coalesce(te.trial_ends_at,
                f.first_upload_at + interval '14 days',
                u.created_at + interval '30 days')    as access_ends_at,
       u.last_sign_in_at,
       ua.last_seen_at,
       se.last_session,
       greatest(u.last_sign_in_at, ua.last_seen_at, se.last_session, up.last_upload, cm.last_comment) as last_activity,
       coalesce(up.uploads, 0)                        as uploads,
       coalesce(cm.comments, 0)                       as comments,
       coalesce(ev.shares, 0)                         as shares,
       coalesce(ev.paywall_views, 0)                  as paywall_views,
       ev.first_pro_feature_at
from auth.users u
left join first_user_uploads f on f.user_id = u.id::text
left join trial_extensions te on te.user_id = u.id
left join user_activity ua on ua.user_id = u.id
left join up on up.uid = u.id::text
left join cm on cm.uid = u.id::text
left join se on se.uid = u.id::text
left join ev on ev.uid = u.id::text
order by u.created_at desc;
