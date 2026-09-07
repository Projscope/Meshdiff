import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAdminBlogPosts, deleteBlogPost, updateBlogPost, type AdminBlogPost } from "../lib/blogApi";
import BlogPostCard from "../components/BlogPostCard";
import ConfirmDialog from "../components/ConfirmDialog";

const PAGE_SIZE = 10;

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<AdminBlogPost[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminBlogPost | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function refresh() {
    listAdminBlogPosts(page).then((result) => {
      if (result.success) {
        setPosts(result.data.posts);
        setTotal(result.data.total);
      } else {
        setError(result.error);
      }
    });
  }

  useEffect(refresh, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteBlogPost(pendingDelete.id);
    setIsDeleting(false);
    setPendingDelete(null);
    if (result.success) refresh();
    else setError(result.error);
  }

  async function handleTogglePublish(post: AdminBlogPost) {
    setTogglingId(post.id);
    const result = await updateBlogPost(post.id, { status: post.status === "published" ? "draft" : "published" });
    setTogglingId(null);
    if (result.success) refresh();
    else setError(result.error);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-50">Blog</h1>
        <Link
          to="/admin/blog/new"
          className="rounded-lg bg-accent-500 px-3.5 py-1.5 text-sm font-medium text-chrome-950 hover:bg-accent-400"
        >
          + New post
        </Link>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6 flex flex-col gap-4">
        {posts && posts.length === 0 && (
          <p className="rounded-lg border border-ink-800 bg-ink-900 px-4 py-10 text-center text-sm text-ink-500">
            No posts yet — click "+ New post" to write one.
          </p>
        )}

        {posts?.map((post) => (
          <BlogPostCard
            key={post.id}
            post={post}
            to={`/admin/blog/${post.id}`}
            badge={
              <>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    post.status === "published" ? "bg-accent-500/15 text-accent-fg-400" : "bg-ink-800 text-ink-400"
                  }`}
                >
                  {post.status}
                </span>
                {post.status === "published" && (
                  <span title="All-time pageviews from the self-hosted analytics tracker">
                    {post.views.toLocaleString()} view{post.views === 1 ? "" : "s"}
                  </span>
                )}
              </>
            }
            actions={
              <div className="flex items-center gap-3 text-[11px]">
                <Link to={`/admin/blog/${post.id}`} className="text-ink-400 hover:text-ink-100">
                  Edit
                </Link>
                {post.status === "published" && (
                  <a
                    href={`/blog/${post.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-400 hover:text-ink-100"
                  >
                    View
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void handleTogglePublish(post)}
                  disabled={togglingId === post.id}
                  className="text-ink-400 hover:text-ink-100 disabled:opacity-50"
                >
                  {togglingId === post.id ? "…" : post.status === "published" ? "Unpublish" : "Publish"}
                </button>
                <button type="button" onClick={() => setPendingDelete(post)} className="text-ink-500 hover:text-red-400">
                  Delete
                </button>
              </div>
            }
          />
        ))}
      </div>

      {posts && total > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
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

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.title}"?`}
          message="This can't be undone."
          confirmLabel="Delete"
          isDestructive
          isConfirming={isDeleting}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
