-- Projects workspace: persistent projects with version history, cached
-- diffs, and 3D-pinned comments. Applied manually (no migration tooling
-- exists in this repo yet) via the Supabase SQL editor.
--
-- owner_user_id / uploaded_by_user_id / author_user_id are nullable for
-- now — Clerk auth lands in a later phase (see plan), at which point a
-- follow-up migration backfills and tightens these to NOT NULL plus adds
-- RLS policies keyed off auth.jwt(). Until then, ownership is enforced at
-- the API layer only.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists versions (
  id text primary key, -- ULID
  project_id uuid not null references projects(id) on delete cascade,
  version_number int not null,
  file_name text not null,
  file_path text not null,
  file_format text not null check (file_format in ('stl', 'obj', '3mf')),
  file_size_bytes bigint not null,
  triangle_count int,
  change_summary text,
  printability_status text check (printability_status in ('pass', 'warn', 'fail')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved')),
  uploaded_by_user_id text,
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create index if not exists versions_project_id_idx on versions(project_id);

create table if not exists version_diffs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version_a_id text not null references versions(id) on delete cascade,
  version_b_id text not null references versions(id) on delete cascade,
  stats jsonb not null, -- VoxelDiffStats (extended with fileFormatA/fileFormatB)
  printability_status text not null check (printability_status in ('pass', 'warn', 'fail')),
  computed_at timestamptz not null default now(),
  unique (version_a_id, version_b_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  version_id text not null references versions(id) on delete cascade,
  author_user_id text,
  body text not null,
  position_x real not null,
  position_y real not null,
  position_z real not null,
  normal_x real,
  normal_y real,
  normal_z real,
  created_at timestamptz not null default now()
);

create index if not exists comments_version_id_idx on comments(version_id);

-- Allocates the next version_number for a project and inserts the row
-- atomically (an advisory lock scoped to the calling transaction, held for
-- the duration of this single RPC call, serializes concurrent uploads to
-- the same project so two clients can never race to claim the same number).
create or replace function create_version(
  p_id text,
  p_project_id uuid,
  p_file_name text,
  p_file_path text,
  p_file_format text,
  p_file_size_bytes bigint,
  p_uploaded_by_user_id text
) returns versions
language plpgsql
as $$
declare
  v_number int;
  v_row versions;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));
  select coalesce(max(version_number), 0) + 1 into v_number
  from versions where project_id = p_project_id;

  insert into versions (
    id, project_id, version_number, file_name, file_path,
    file_format, file_size_bytes, uploaded_by_user_id
  )
  values (
    p_id, p_project_id, v_number, p_file_name, p_file_path,
    p_file_format, p_file_size_bytes, p_uploaded_by_user_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- Separate from share-meshes: projects are durable/owned, shares are
-- ephemeral/anonymous — keeps future lifecycle policies (e.g. an expiry
-- sweep on share-meshes) from ever touching project data.
insert into storage.buckets (id, name, public)
values ('project-meshes', 'project-meshes', false)
on conflict (id) do nothing;
