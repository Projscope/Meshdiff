-- Team tier: per-seat billing on top of the Pro-only subscriptions table
-- from 0012, plus a DB-level cap of one team per owner. 'team' was already
-- reserved in 0012's check constraint comment ("'team' added in a future
-- pass") — this is that pass.

alter table subscriptions drop constraint if exists subscriptions_tier_check;
alter table subscriptions
  add constraint subscriptions_tier_check
  check (tier in ('pro', 'team'));

-- Seats purchased on the subscription's single line item. Defaults to 1 so
-- existing Pro rows (always quantity 1) don't need a backfill.
alter table subscriptions
  add column if not exists quantity int not null default 1;

-- One team per owner — Team billing buys exactly one subscription's worth
-- of seats, and one subscription maps to exactly one team. teams.owner_user_id
-- was previously unconstrained; this closes that gap going forward.
alter table teams
  add constraint teams_owner_user_id_key unique (owner_user_id);

-- Single round-trip check for "does this (free-tier) user get access
-- because they're on someone else's active Team subscription" — used by
-- getAccountAccess() instead of separate client-side queries per request.
-- security definer because team_members/subscriptions RLS (0006, 0012)
-- otherwise only lets a user read their own rows; the API's service-role
-- key bypasses RLS anyway when calling this via rpc(), same trust boundary
-- as get_user_id_by_email (0007).
create or replace function has_active_team_access(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from team_members tm
    join teams t on t.id = tm.team_id
    join subscriptions s on s.user_id = t.owner_user_id
    where tm.user_id = p_user_id
      and s.tier = 'team'
      and s.status not in ('canceled', 'past_due')
  );
$$;

notify pgrst, 'reload schema';
