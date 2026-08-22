-- blog_posts was created without RLS, leaving it fully readable/writable by
-- anyone with the anon key via Supabase's client API (bypassing the Fastify
-- routes in blog.ts entirely). The API only ever talks to Supabase through
-- the service-role key (see lib/supabase.ts), which bypasses RLS, so a
-- deny-by-default policy set here doesn't affect the admin CRUD routes —
-- only direct anon/authenticated access is restricted.

alter table blog_posts enable row level security;

create policy "Published posts are publicly readable" on blog_posts
  for select using (status = 'published');

notify pgrst, 'reload schema';
