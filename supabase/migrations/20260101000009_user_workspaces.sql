-- Per-user "workspace" name shown in the sidebar (distinct from Team —
-- every user has exactly one personal workspace, defaulting to "My
-- Workspace", renamable from the UI). One row per user, created lazily on
-- first read rather than backfilled for existing users.

create table if not exists user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'My Workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_workspaces enable row level security;

create policy "Users manage their own workspace" on user_workspaces
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
