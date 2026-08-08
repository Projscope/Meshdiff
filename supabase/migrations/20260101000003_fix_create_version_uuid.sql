-- Migration 0002 changed versions.uploaded_by_user_id from text to uuid, but
-- the create_version() function (defined in 0001) still declares its
-- p_uploaded_by_user_id parameter as text, causing "column is of type uuid
-- but expression is of type text" on every version upload. Recreate the
-- function with the corrected parameter type (found via live verification
-- of the auth-gated upload flow).
create or replace function create_version(
  p_id text,
  p_project_id uuid,
  p_file_name text,
  p_file_path text,
  p_file_format text,
  p_file_size_bytes bigint,
  p_uploaded_by_user_id uuid
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
