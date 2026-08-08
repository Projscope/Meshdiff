-- Adds an "approver" role: an "upgraded member" who can approve/reject
-- pending versions (like admin) but cannot invite or remove team members
-- (still admin/owner-only). See ownership.ts's getProjectAccess() and
-- versions.ts's canReviewVersions() for where this is read.

alter table team_members drop constraint if exists team_members_role_check;
alter table team_members
  add constraint team_members_role_check
  check (role in ('admin', 'approver', 'member'));

notify pgrst, 'reload schema';
