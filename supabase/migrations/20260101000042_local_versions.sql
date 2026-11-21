-- Supports the desktop client's "sync without the file": a version whose model
-- stays on the owner's computer (storage_mode = 'local'), and comment sync that
-- survives being created offline and deleted elsewhere.
--
-- Cloud versions are unchanged: they keep a file_path and storage_mode 'cloud'.

-- ---------------------------------------------------------------------------
-- Versions
-- ---------------------------------------------------------------------------

-- A local version has no uploaded file, so there is no path to store.
alter table versions alter column file_path drop not null;

alter table versions
  add column if not exists storage_mode text not null default 'cloud'
    check (storage_mode in ('cloud', 'local')),
  -- Lowercase hex SHA-256 of the model file. Lets a reviewer who has their own
  -- copy confirm it is the same file. Null for cloud versions (the file itself
  -- is the source of truth there).
  add column if not exists content_sha256 text
    check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');

-- Exactly the local versions have no file path. Existing rows are all cloud
-- versions with a path, so this holds for them.
alter table versions drop constraint if exists versions_storage_mode_file_check;
alter table versions
  add constraint versions_storage_mode_file_check
  check ((storage_mode = 'local') = (file_path is null));

-- A separate function rather than a new signature on create_version(): Postgres
-- treats a changed signature as a new overload, and PostgREST then can't choose
-- between them (see 0003/0004, which hit exactly that).
--
-- The caller supplies the version id (the desktop app's own ULID), which makes
-- the call idempotent: a retried sync returns the version it already created
-- instead of making a duplicate. It takes the same advisory lock as
-- create_version(), so concurrent cloud and local uploads still can't claim the
-- same version number.
create or replace function create_local_version(
  p_id text,
  p_project_id uuid,
  p_file_name text,
  p_file_format text,
  p_file_size_bytes bigint,
  p_content_sha256 text,
  p_uploaded_by_user_id uuid
) returns versions
language plpgsql
as $$
declare
  v_number int;
  v_row versions;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select * into v_row from versions where id = p_id;
  if found then
    if v_row.project_id = p_project_id
       and v_row.storage_mode = 'local'
       and v_row.content_sha256 = p_content_sha256 then
      return v_row;
    end if;
    -- The id is taken by something else (another project, or different content).
    raise exception 'version_id_conflict' using errcode = '23505';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_number
  from versions where project_id = p_project_id;

  insert into versions (
    id, project_id, version_number, file_name, file_path,
    file_format, file_size_bytes, uploaded_by_user_id,
    storage_mode, content_sha256
  )
  values (
    p_id, p_project_id, v_number, p_file_name, null,
    p_file_format, p_file_size_bytes, p_uploaded_by_user_id,
    'local', p_content_sha256
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

-- updated_at lets a client ask "what changed since I last looked", and
-- deleted_at turns a delete into a tombstone so that question can also answer
-- "this was deleted" (a hard delete leaves nothing to report).
alter table comments add column if not exists updated_at timestamptz not null default now();
alter table comments add column if not exists deleted_at timestamptz;

-- Existing comments keep their real chronology rather than all becoming "just
-- updated". Runs before the trigger below exists, so it is not overwritten.
update comments set updated_at = greatest(created_at, coalesce(status_changed_at, created_at));

create or replace function set_comment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists comments_set_updated_at on comments;
create trigger comments_set_updated_at
  before update on comments
  for each row execute function set_comment_updated_at();

create index if not exists comments_updated_at_idx on comments (updated_at);

notify pgrst, 'reload schema';
