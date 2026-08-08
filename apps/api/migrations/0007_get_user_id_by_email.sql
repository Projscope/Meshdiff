-- Team invites need to resolve an email to a user id. PostgREST doesn't
-- expose the `auth` schema, and supabase-js's admin.listUsers() has no
-- email filter (paginates all users) — a security-definer RPC is the
-- standard way to bridge this without paginating the whole user table.
create or replace function get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth
as $$
  select id from auth.users where email = p_email limit 1;
$$;

notify pgrst, 'reload schema';
