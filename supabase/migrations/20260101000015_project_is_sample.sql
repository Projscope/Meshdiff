-- Marks the auto-seeded "Sample Project" (see seedSampleProject.ts) so free
-- users can be let in on that one project specifically, instead of gating
-- purely by tier. Free users get full read/write on their own sample
-- project (upload, compare, delete, share, report, measure) but nothing
-- else — see requireProjectTierAccess.ts.
alter table projects add column if not exists is_sample boolean not null default false;

-- Backfill: mark existing auto-seeded sample projects created before this
-- column existed, matched on the exact name+description seedSampleProject.ts
-- has always used — narrow enough that a real user's own "Sample Project"
-- would need to coincidentally match both fields verbatim.
update projects
set is_sample = true
where name = 'Sample Project'
  and description = 'An example project showing how version history and diffs work — feel free to delete this.';

notify pgrst, 'reload schema';
