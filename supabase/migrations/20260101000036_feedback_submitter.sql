-- Captures who submitted feedback and from where, beyond the optional
-- reply-to "email" the submitter types in themselves. The "Add Feedback"
-- button is global now (not just the unauthenticated /live tool), so a
-- logged-in user's request already carries a Supabase bearer token even
-- though POST /feedback stays open to anonymous callers — see
-- getOptionalUser() in requireAuth.ts. None of this is shown to the
-- submitter; it's admin-only context surfaced in AdminFeedbackPage.tsx.
alter table feedback add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table feedback add column if not exists user_email text;
alter table feedback add column if not exists user_agent text;

notify pgrst, 'reload schema';
