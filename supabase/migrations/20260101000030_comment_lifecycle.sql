-- Comment lifecycle: open/resolved/reopened status, an optional assignee
-- and priority. No separate history table (unlike version_reviews) —
-- nothing in this feature set asks for "who reopened this and when, across
-- every prior reopen" the way versions' review history does; the single
-- status_changed_by/at pair is enough. Replies (parent_comment_id set) can
-- carry these independently of their parent, matching GitHub's own PR
-- review-thread model — no special-casing.

alter table comments
  add column if not exists status text not null default 'open'
    check (status in ('open', 'resolved', 'reopened')),
  add column if not exists assignee_user_id uuid references auth.users(id) on delete set null,
  add column if not exists priority text
    check (priority in ('low', 'normal', 'high') or priority is null),
  add column if not exists status_changed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists status_changed_at timestamptz;

create index if not exists comments_assignee_user_id_idx on comments(assignee_user_id) where assignee_user_id is not null;
create index if not exists comments_status_idx on comments(version_id, status);

notify pgrst, 'reload schema';
