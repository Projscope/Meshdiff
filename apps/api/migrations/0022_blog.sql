-- Admin-published tech blog: text (Markdown) + inline images/video, drafted
-- and published from the admin panel — replaces the earlier hand-coded
-- page-per-post scaffold (see git history, BlogIndexPage.tsx's original
-- POSTS array). Slug is the public URL segment (/blog/:slug); cover_image_path
-- and any inline images/video live in the public "blog-assets" bucket
-- (unlike project meshes, blog media is meant to be publicly linkable —
-- SEO image indexing, social-share unfurls, no signed-URL expiry to worry
-- about on a long-lived post).
create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content_markdown text not null default '',
  cover_image_path text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  author_user_id text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_status_published_at_idx on blog_posts(status, published_at desc);

-- Public, unlike project-meshes: blog images/video need to be directly
-- linkable (img src, og:image, social-card unfurls) without a signed URL.
insert into storage.buckets (id, name, public)
values ('blog-assets', 'blog-assets', true)
on conflict (id) do nothing;
