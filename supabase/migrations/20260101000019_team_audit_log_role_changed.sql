-- Adds the 'member_role_changed' audit action ahead of the new
-- PATCH /teams/:teamId/members/:userId endpoint (role changes for
-- existing members, not just invite/remove).

alter table team_audit_log drop constraint if exists team_audit_log_action_check;

alter table team_audit_log add constraint team_audit_log_action_check check (action in (
  'team_created', 'member_invited', 'member_removed', 'member_role_changed',
  'version_approved', 'version_rejected'
));

notify pgrst, 'reload schema';
