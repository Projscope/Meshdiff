-- Backfills the anonymous Live Diff "shares" schema, which predates this
-- migrations folder and was only ever created directly on the production
-- Supabase project. Without this, a fresh local/staging Supabase instance
-- has no shares table and share creation fails with PGRST205.

create table if not exists shares (
  id uuid primary key,
  expires_at timestamptz not null,
  mode text not null check (mode in ('voxel', 'surface')),
  tolerance_mm numeric not null,
  file_a_name text not null,
  file_b_name text not null,
  file_a_path text not null,
  file_b_path text not null,
  created_at timestamptz not null default now()
);

alter table shares enable row level security;

-- Anonymous, ephemeral, permanent log of share creations for a future
-- admin dashboard — deliberately independent of the shares row's lifecycle
-- (delete_expired_shares() purges shares but never touches share_stats).
create table if not exists share_stats (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null,
  expires_in_days int not null,
  share_url text not null,
  created_at timestamptz not null default now()
);

alter table share_stats enable row level security;

insert into storage.buckets (id, name, public)
values ('share-meshes', 'share-meshes', false)
on conflict (id) do nothing;

create or replace function delete_expired_shares()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from storage.objects
  where bucket_id = 'share-meshes'
    and (storage.foldername(name))[1] in (
      select id::text from shares where expires_at <= now()
    );

  delete from shares where expires_at <= now();
end;
$$;

create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'delete-expired-shares') then
    perform cron.schedule('delete-expired-shares', '0 3 * * *', 'select delete_expired_shares();');
  end if;
end $$;
