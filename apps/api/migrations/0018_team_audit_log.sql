-- Trust/compliance for the Team tier: a record of who invited/removed
-- whom and who approved/rejected what, since those actions today just
-- overwrite prior state (versions.reviewed_by_user_id/reviewed_at only
-- ever holds the *latest* reviewer) with no history.

create table team_audit_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'team_created', 'member_invited', 'member_removed',
    'version_approved', 'version_rejected'
  )),
  -- Denormalized on write, not reconstructed by joining at read time —
  -- an audit log's whole point is surviving the deletion of whatever it
  -- describes (a removed member, a deleted project). e.g. "Invited
  -- jane@co.com as member", "Approved v3 of Bracket Mount".
  summary text not null,
  created_at timestamptz not null default now()
);

create index team_audit_log_team_id_created_at_idx on team_audit_log(team_id, created_at desc);

alter table team_audit_log enable row level security;

-- Same defense-in-depth convention as 0006/0012 — the API's service-role
-- key bypasses RLS for the actual inserts/reads; this just means a
-- non-member can never read another team's log even through a client
-- that somehow got a raw anon key.
create policy "Team members view their team's audit log" on team_audit_log
  for select using (
    exists (
      select 1 from team_members tm
      where tm.team_id = team_audit_log.team_id and tm.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
