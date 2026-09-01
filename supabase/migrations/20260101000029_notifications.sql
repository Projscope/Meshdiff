-- In-app only for this milestone — no email delivery. email_sent_at
-- reserves the seam for adding email later without another migration.
--
-- version_id/comment_id are text: versions.id and comments derive their
-- version_id from a ULID stored as text (see 0001), not a uuid — this bit
-- us on 0027, so notifications gets it right from the start.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in (
    'mention', 'comment_assigned', 'version_state_changed',
    'review_requested', 'gate_completed'
  )),
  project_id uuid references projects(id) on delete cascade,
  version_id text references versions(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  -- Denormalized like team_audit_log.summary — survives the referenced row
  -- being later deleted, so a notification never renders as a broken link.
  summary text not null,
  read_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_unread_idx on notifications(recipient_user_id, created_at desc) where read_at is null;
create index notifications_recipient_all_idx on notifications(recipient_user_id, created_at desc);

alter table notifications enable row level security;

-- Defense-in-depth only (see 0002's note: the API's service-role key
-- bypasses RLS; real enforcement is in route handlers).
create policy "Users see only their own notifications" on notifications
  for select using (recipient_user_id = auth.uid());
create policy "Users can mark their own notifications read" on notifications
  for update using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

notify pgrst, 'reload schema';
