-- Removes the 7-day trial (see 0013) — Pro is now payable from the first
-- day; a non-subscribed account is "restricted" immediately, not after a
-- grace period. Drops the trigger/function/table added in 0013 rather than
-- just leaving them unused, since nothing reads user_trials anymore (see
-- getAccountAccess in apps/api/src/lib/subscription.ts).

drop trigger if exists on_auth_user_created_trial on auth.users;
drop function if exists public.handle_new_user_trial();
drop table if exists user_trials;

notify pgrst, 'reload schema';
