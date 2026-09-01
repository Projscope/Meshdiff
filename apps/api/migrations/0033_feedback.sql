-- "Add Feedback" button on the free Live Diff tool — notes, feature
-- requests, and bug reports from anonymous visitors, submitted through the
-- API's service-role client (see requireSupabase.ts's note: safe on
-- unauthenticated routes). Service-role only, no RLS policies — same
-- convention as demo_accounts (0025): the Fastify routes are the only
-- caller, both for the public insert and the admin-only read/update.

create table feedback (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('note', 'feature', 'bug')),
  message text not null,
  -- Optional contact info — the submitter is anonymous by default (this is
  -- the unauthenticated free tool), so there's no user_id to fall back on.
  email text,
  -- Which page they were on when they clicked "Add Feedback" (e.g.
  -- "/live", "/compare-stl-files") — useful context an admin can't
  -- otherwise recover once support@ isn't cc'd on it.
  page text,
  status text not null default 'new' check (status in ('new', 'reviewed')),
  created_at timestamptz not null default now()
);

create index feedback_created_at_idx on feedback (created_at desc);
create index feedback_status_new_idx on feedback (created_at desc) where status = 'new';

alter table feedback enable row level security;

notify pgrst, 'reload schema';
