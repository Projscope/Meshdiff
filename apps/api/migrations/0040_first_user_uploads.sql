-- The free trial's 14-day clock starts at a user's first real upload (a
-- version in a non-sample project), not at signup — see computeTrialStatus()
-- in subscription.ts. A view rather than a stored column so there's nothing
-- to backfill or keep in sync: it's derived from versions each time.
--
-- uploaded_by_user_id is cast to text because early rows predate Supabase
-- Auth and hold non-uuid ids; callers compare it as a string.
create or replace view first_user_uploads as
select
  v.uploaded_by_user_id::text as user_id,
  min(v.created_at) as first_upload_at
from versions v
join projects p on p.id = v.project_id
where p.is_sample = false
  and v.uploaded_by_user_id is not null
group by v.uploaded_by_user_id::text;

-- Service-role only, like the other trial/billing tables. Views run with
-- their owner's privileges, so without this the anon key could read it.
revoke all on first_user_uploads from anon, authenticated;

notify pgrst, 'reload schema';
