-- 7-day trial with post-trial restriction. New (and existing) users get a
-- trial computed from their real signup date; once it lapses without a
-- Pro subscription, most API routes reject them (see requireActiveAccess.ts)
-- — they can still sign in/out and list/delete their own projects.

create table if not exists user_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table user_trials enable row level security;

create policy "Users view their own trial" on user_trials
  for select using (user_id = auth.uid());

-- Every new signup gets a trial row automatically — a DB trigger (not app
-- code) so it's guaranteed to exist regardless of which client/flow
-- created the auth.users row, matching how this project already leans on
-- Postgres functions for auth-adjacent logic (see 0007/0008's RPCs).
create or replace function public.handle_new_user_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_trials (user_id, trial_ends_at)
  values (new.id, new.created_at + interval '7 days');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_trial on auth.users;
create trigger on_auth_user_created_trial
  after insert on auth.users
  for each row execute function public.handle_new_user_trial();

-- Backfill every existing user from their real original signup date (not
-- "now") — some existing accounts will already show as expired the moment
-- this ships; that's the intended behavior, not a bug.
insert into user_trials (user_id, trial_ends_at)
select id, created_at + interval '7 days' from auth.users
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
