-- Slicer profile snapshot + print result photo per version (CLAUDE.md MVP
-- scope, Team-tier pricing table). Both are opaque attachments stored in
-- the existing project-meshes bucket under a distinct path suffix — no new
-- bucket/RLS needed, storage access already goes entirely through
-- server-issued signed URLs (see versions.ts). The slicer profile is
-- deliberately unparsed free text (CLAUDE.md: "text upload, not parsed"),
-- not full G-code toolpath data (out of scope).
alter table versions
  add column if not exists slicer_profile_path text,
  add column if not exists slicer_profile_file_name text,
  add column if not exists print_photo_path text,
  add column if not exists print_photo_file_name text,
  add column if not exists print_photo_caption text;
