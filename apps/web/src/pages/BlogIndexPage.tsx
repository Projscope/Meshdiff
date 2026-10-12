import { useEffect, useState } from "react";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { listBlogPosts, type BlogPost } from "../lib/blogApi";
import BlogPostCard from "../components/BlogPostCard";

export const META_TITLE = "Blog | Meshdiff";
export const META_DESCRIPTION = "Updates, write-ups, and behind-the-scenes notes on building Meshdiff's diff engine.";

const PAGE_SIZE = 10;

export default function BlogIndexPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPosts(null);
    listBlogPosts(page).then((result) => {
      if (result.success) {
        setPosts(result.data.posts);
        setTotal(result.data.total);
      } else {
        setError(result.error);
      }
    });
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <main>
        <section className="mx-auto max-w-3xl px-6 pb-10 pt-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Blog</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-ink-50 md:text-5xl">
            Notes from building Meshdiff
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-400">
            Updates on the diff engine, write-ups on how the comparison actually works, and the occasional bit of
            outside coverage.
          </p>
        </section>

        <section className="border-t border-ink-900 px-6 py-14">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {error && <p className="text-sm text-red-400">{error}</p>}
            {posts && posts.length === 0 && <p className="text-sm text-ink-500">No posts yet — check back soon.</p>}
            {posts?.map((post) => (
              <BlogPostCard key={post.id} post={post} to={`/blog/${post.slug}`} />
            ))}
          </div>

          {posts && total > PAGE_SIZE && (
            <div className="mx-auto mt-8 flex max-w-3xl items-center justify-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-sm border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-ink-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-sm border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
