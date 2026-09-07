-- New feedback -> admins gets its own notification type, so an admin
-- learns about a submission without having to remember to check
-- /admin/feedback. feedback_id lets the notification deep-link straight to
-- the specific entry (see NotificationInbox.tsx / AdminFeedbackPage.tsx).
-- Cascades on delete: removing a feedback row (see the new DELETE
-- /admin/feedback/:id) cleans up its notifications too, rather than
-- leaving them pointing at nothing.

alter table notifications add column if not exists feedback_id uuid references feedback(id) on delete cascade;

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'mention', 'comment_assigned', 'version_state_changed', 'review_requested', 'gate_completed',
  'comment_status_changed', 'feedback_submitted'
));

-- project_id was "not null"-free already (see 0029), but feedback
-- notifications have no project at all — nothing to change there, this
-- comment just documents that it's intentional for this new type.

notify pgrst, 'reload schema';
