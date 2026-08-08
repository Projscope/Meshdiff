-- Switches ownership columns from bare text to uuid FKs against Supabase
-- Auth's built-in auth.users table, and enables RLS. Supabase Auth (not
-- Clerk) is the auth provider for this feature — see project memory
-- "auth_provider_supabase_not_clerk" for why. No real project data exists
-- yet (all verification data was cleaned up after each task), so this
-- migration assumes existing owner_user_id/uploaded_by_user_id/
-- author_user_id values are all null.

alter table projects
  alter column owner_user_id type uuid using owner_user_id::uuid,
  add constraint projects_owner_user_id_fkey
    foreign key (owner_user_id) references auth.users(id) on delete cascade;

alter table versions
  alter column uploaded_by_user_id type uuid using uploaded_by_user_id::uuid,
  add constraint versions_uploaded_by_user_id_fkey
    foreign key (uploaded_by_user_id) references auth.users(id) on delete set null;

alter table comments
  alter column author_user_id type uuid using author_user_id::uuid,
  add constraint comments_author_user_id_fkey
    foreign key (author_user_id) references auth.users(id) on delete set null;

-- RLS is defense-in-depth here: apps/api's Supabase client uses the
-- service-role key, which bypasses RLS entirely, so the actual
-- enforcement is the owner_user_id filtering in each route handler.
-- These policies protect against any future direct-to-Supabase access
-- (e.g. a client using the anon key) per CLAUDE.md's "User A cannot
-- access User B's project IDs (RLS)" requirement.
alter table projects enable row level security;
alter table versions enable row level security;
alter table version_diffs enable row level security;
alter table comments enable row level security;

create policy "Users manage their own projects" on projects
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "Users manage versions of their own projects" on versions
  for all using (exists (
    select 1 from projects where projects.id = versions.project_id and projects.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from projects where projects.id = versions.project_id and projects.owner_user_id = auth.uid()
  ));

create policy "Users manage diffs of their own projects" on version_diffs
  for all using (exists (
    select 1 from projects where projects.id = version_diffs.project_id and projects.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from projects where projects.id = version_diffs.project_id and projects.owner_user_id = auth.uid()
  ));

create policy "Users manage comments on their own project versions" on comments
  for all using (exists (
    select 1 from versions
    join projects on projects.id = versions.project_id
    where versions.id = comments.version_id and projects.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from versions
    join projects on projects.id = versions.project_id
    where versions.id = comments.version_id and projects.owner_user_id = auth.uid()
  ));
