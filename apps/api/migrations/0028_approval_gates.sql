-- Configurable per-project approval checklists (e.g. "Geometry reviewed",
-- "Printability passed") that must all be satisfied before a version can be
-- approved. Definitions are scoped to the project, not the team, since
-- projects on the same team may want different checklists. Team-tier only —
-- personal (Pro) projects auto-approve on upload and never get rows here.
--
-- version_id is text: versions.id is a ULID stored as text (see 0001), not
-- a uuid — this bit us applying 0027, fixed there and applied correctly here.

create table approval_gate_definitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  -- Soft-delete: existing fulfillment rows for older versions stay
  -- meaningful even after a gate is removed from future versions.
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index approval_gate_definitions_project_id_idx on approval_gate_definitions(project_id) where is_active;

create table approval_gate_fulfillments (
  id uuid primary key default gen_random_uuid(),
  version_id text not null references versions(id) on delete cascade,
  gate_definition_id uuid not null references approval_gate_definitions(id) on delete cascade,
  satisfied boolean not null default false,
  satisfied_by_user_id uuid references auth.users(id) on delete set null,
  satisfied_at timestamptz,
  unique (version_id, gate_definition_id)
);

create index approval_gate_fulfillments_version_id_idx on approval_gate_fulfillments(version_id);

alter table approval_gate_definitions enable row level security;
alter table approval_gate_fulfillments enable row level security;

-- Defense-in-depth only (see 0002's note: the API's service-role key
-- bypasses RLS; real enforcement is in route handlers).
create policy "Owners and team members view gate definitions" on approval_gate_definitions
  for select using (exists (
    select 1 from projects
    left join team_members on team_members.team_id = projects.team_id and team_members.user_id = auth.uid()
    where projects.id = approval_gate_definitions.project_id
      and (projects.owner_user_id = auth.uid() or team_members.user_id is not null)
  ));

create policy "Owners and team members view gate fulfillments" on approval_gate_fulfillments
  for select using (exists (
    select 1 from versions
    join projects on projects.id = versions.project_id
    left join team_members on team_members.team_id = projects.team_id and team_members.user_id = auth.uid()
    where versions.id = approval_gate_fulfillments.version_id
      and (projects.owner_user_id = auth.uid() or team_members.user_id is not null)
  ));

notify pgrst, 'reload schema';
