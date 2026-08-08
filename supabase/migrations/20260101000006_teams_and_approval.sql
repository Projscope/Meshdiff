-- Team version-approval workflow: teams/team_members introduce the app's
-- first real multi-user concept. A project's team_id being null means
-- "personal/Pro" (today's behavior, ungated); non-null means "Team"
-- (uploads require admin approval before becoming the stable version).
-- See plan "Team Version-Approval Workflow" for the full design.

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index if not exists team_members_team_id_idx on team_members(team_id);
create index if not exists team_members_user_id_idx on team_members(user_id);

alter table projects
  add column if not exists team_id uuid references teams(id) on delete set null;

create index if not exists projects_team_id_idx on projects(team_id);

-- Add 'rejected' to the approval_status states. Postgres has no
-- "alter constraint", so drop + recreate; the constraint's auto-generated
-- name follows Postgres's <table>_<column>_check convention.
alter table versions drop constraint if exists versions_approval_status_check;
alter table versions
  add constraint versions_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

alter table versions
  add column if not exists reviewed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text;

alter table teams enable row level security;
alter table team_members enable row level security;

-- Defense-in-depth only (see 0002's note: the API's service-role key
-- bypasses RLS; real enforcement is in the route handlers via
-- getProjectAccess()). A team is visible to its owner and its members.
create policy "Team owner manages the team" on teams
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "Team members can view their team" on teams
  for select using (exists (
    select 1 from team_members where team_members.team_id = teams.id and team_members.user_id = auth.uid()
  ));

create policy "Team owner manages members" on team_members
  for all using (exists (
    select 1 from teams where teams.id = team_members.team_id and teams.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from teams where teams.id = team_members.team_id and teams.owner_user_id = auth.uid()
  ));

create policy "Members can view their own membership rows" on team_members
  for select using (user_id = auth.uid());

-- Extend the existing owner-only project/version policies (from 0002) to
-- also cover team members, now that a project can belong to a team.
drop policy if exists "Users manage their own projects" on projects;
create policy "Owners and team members manage projects" on projects
  for all using (
    owner_user_id = auth.uid()
    or exists (select 1 from team_members where team_members.team_id = projects.team_id and team_members.user_id = auth.uid())
  )
  with check (owner_user_id = auth.uid());

drop policy if exists "Users manage versions of their own projects" on versions;
create policy "Owners and team members manage versions" on versions
  for all using (exists (
    select 1 from projects
    left join team_members on team_members.team_id = projects.team_id and team_members.user_id = auth.uid()
    where projects.id = versions.project_id
      and (projects.owner_user_id = auth.uid() or team_members.user_id is not null)
  ))
  with check (exists (
    select 1 from projects
    left join team_members on team_members.team_id = projects.team_id and team_members.user_id = auth.uid()
    where projects.id = versions.project_id
      and (projects.owner_user_id = auth.uid() or team_members.user_id is not null)
  ));

notify pgrst, 'reload schema';
