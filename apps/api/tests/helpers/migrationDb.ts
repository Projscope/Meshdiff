import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../supabase/migrations");

/** An in-process Postgres with just enough of Supabase's platform stubbed
 * (roles, auth.users/uid(), storage, pg_cron) for the real migrations to run. */
export async function createSupabaseStubDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    create schema extensions;
    create schema cron;
    create table cron.job (jobid bigserial primary key, jobname text);
    create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ select 1::bigint $$;
  `);
  return db;
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

export function readMigration(file: string): string {
  // pg_cron isn't available in this Postgres; the stub above provides cron.schedule().
  return readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/create extension if not exists pg_cron;/gi, "-- pg_cron stubbed");
}

/** Applies every migration whose file name sorts strictly before `stopBefore`
 * (or all of them when omitted). */
export async function applyMigrations(db: PGlite, stopBefore?: string): Promise<void> {
  for (const file of migrationFiles()) {
    if (stopBefore && file >= stopBefore) break;
    await db.exec(readMigration(file));
  }
}
