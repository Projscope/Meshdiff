-- Team member lists need to show emails, not raw auth.users UUIDs.
-- Same security-definer bridge pattern as 0007's get_user_id_by_email.
create or replace function get_user_emails_by_ids(p_ids uuid[])
returns table (id uuid, email text)
language sql
security definer
set search_path = auth
as $$
  select id, email from auth.users where id = any(p_ids);
$$;

notify pgrst, 'reload schema';
