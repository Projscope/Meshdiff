-- Postgres treats a differing parameter type as a new overload, not a
-- replacement — migration 0003's `create or replace function` with
-- p_uploaded_by_user_id changed from text to uuid left BOTH versions
-- defined, and PostgREST then can't disambiguate which one to call
-- ("Could not choose the best candidate function"). Drop the stale
-- text-typed overload explicitly; the uuid-typed one from 0003 remains.
drop function if exists create_version(text, uuid, text, text, text, bigint, text);
