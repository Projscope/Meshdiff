import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Image } from "@phosphor-icons/react";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { listBlogPosts, type BlogPost } from "../lib/blogApi";

export const META_TITLE = "Blog | Meshdiff";
export const META_DESCRIPTION = "Updates, write-ups, and behind-the-scenes notes on building Meshdiff's diff engine.";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Falls back to a plain-text snippet of the post body when no excerpt is
 * set, so the card never shows an empty gap under the title/date. */
function previewText(post: BlogPost): string | null {
  if (post.excerpt) return post.excerpt;
  const plain = post.contentMarkdown
    .replace(/\{\{video:[^}]*\}\}/g, "")
    .replace(/[#>*_`~-]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  return plain.length > 180 ? `${plain.slice(0, 180)}…` : plain;
}

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
            {posts?.map((post) => {
              const preview = previewText(post);
              return (
                <Link
                  key={post.id}
                  to={`/blog/${post.slug}`}
                  className="flex min-h-[168px] gap-5 rounded-xl border border-ink-800 bg-ink-900 p-6 transition hover:border-ink-700"
                >
                  {post.coverImageUrl ? (
                    <img
                      src={post.coverImageUrl}
                      alt=""
                      className="hidden h-32 w-44 shrink-0 rounded-lg object-cover sm:block"
                    />
                  ) : (
                    <div className="hidden h-32 w-44 shrink-0 items-center justify-center rounded-lg bg-ink-800 sm:flex">
                      <Image size={32} className="text-ink-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-ink-50">{post.title}</h2>
                    <p className="mt-1 text-xs text-ink-500">{post.publishedAt && formatDate(post.publishedAt)}</p>
                    {preview && <p className="mt-3 text-sm leading-relaxed text-ink-400">{preview}</p>}
                  </div>
                </Link>
              );
            })}
          </div>

          {posts && total > PAGE_SIZE && (
            <div className="mx-auto mt-8 flex max-w-3xl items-center justify-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="rounded border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-40"
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
