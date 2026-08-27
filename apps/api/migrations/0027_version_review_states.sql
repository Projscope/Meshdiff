-- Expands the flat pending/approved/rejected approval_status into a real
-- review-state machine: draft -> in_review -> changes_requested -> approved
-- -> superseded. Mapping for existing rows: pending -> in_review,
-- approved -> approved (unchanged), rejected -> changes_requested. 'draft'
-- and 'superseded' have no equivalent today — draft is reachable only via
-- an explicit future "save as draft" action (uploads still default
-- straight to in_review, same as today's default-to-pending); superseded
-- is set automatically server-side when a newer version in the same
-- project is approved (see apps/api/src/routes/versions.ts).
--
-- version_reviews is new: today's single reviewed_by_user_id/reviewed_at/
-- rejection_reason columns on `versions` only ever hold the LATEST
-- reviewer — this table is the real transition history.

update versions set approval_status = 'in_review' where approval_status = 'pending';
update versions set approval_status = 'changes_requested' where approval_status = 'rejected';

alter table versions drop constraint if exists versions_approval_status_check;
alter table versions
  add constraint versions_approval_status_check
  check (approval_status in ('draft', 'in_review', 'changes_requested', 'approved', 'superseded'));

-- The column's own DEFAULT also said 'pending' (set in 0001) — must move
-- in lockstep with the constraint, or the next plain insert (create_version)
-- would violate the constraint just updated above.
alter table versions alter column approval_status set default 'in_review';

create table version_reviews (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references versions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  from_status text not null,
  to_status text not null check (to_status in ('draft', 'in_review', 'changes_requested', 'approved', 'superseded')),
  reason text,           -- rejection/changes-requested reason; null for approve/submit transitions
  created_at timestamptz not null default now()
);

create index version_reviews_version_id_created_at_idx on version_reviews(version_id, created_at asc);

alter table version_reviews enable row level security;

-- Defense-in-depth only (see 0002's note: the API's service-role key
-- bypasses RLS; real enforcement is in route handlers via getProjectAccess()).
create policy "Owners and team members view version review history" on version_reviews
  for select using (exists (
    select 1 from versions
    join projects on projects.id = versions.project_id
    left join team_members on team_members.team_id = projects.team_id and team_members.user_id = auth.uid()
    where versions.id = version_reviews.version_id
      and (projects.owner_user_id = auth.uid() or team_members.user_id is not null)
  ));

-- New "submit for review" transition (draft -> in_review) needs its own
-- audit action, alongside the existing approve/reject ones (which keep
-- their names — 'version_rejected' now also covers the renamed
-- "request changes" transition, to avoid an audit-log UI string-mapping
-- change for something that's semantically the same event).
alter table team_audit_log drop constraint if exists team_audit_log_action_check;
alter table team_audit_log add constraint team_audit_log_action_check check (action in (
  'team_created', 'member_invited', 'member_removed', 'member_role_changed',
  'version_approved', 'version_rejected', 'version_submitted_for_review'
));

notify pgrst, 'reload schema';
