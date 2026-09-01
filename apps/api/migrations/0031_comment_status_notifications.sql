-- Adds 'comment_status_changed' to the notification type enum (see 0029) —
-- resolving/reopening a comment (see 0030's status column) previously had
-- no notification at all, unlike every other comment/version lifecycle
-- transition. Notifies the author and current assignee (if any), same
-- "who's invested in this thread" audience as comment_assigned.

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'mention', 'comment_assigned', 'version_state_changed', 'review_requested', 'gate_completed',
  'comment_status_changed'
));

notify pgrst, 'reload schema';
