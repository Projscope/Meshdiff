-- PostgREST caches the schema (including which RPC function overloads
-- exist) and doesn't always notice DDL changes immediately. If 0004's
-- DROP FUNCTION already ran but the API is still reporting two candidate
-- overloads, this is very likely a stale cache rather than a failed drop.
-- This tells PostgREST to reload.
notify pgrst, 'reload schema';
