import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAdminBlogPosts, deleteBlogPost, type BlogPost } from "../lib/blogApi";
import ConfirmDialog from "../components/ConfirmDialog";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BlogPost | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function refresh() {
    listAdminBlogPosts().then((result) => {
      if (result.success) setPosts(result.data.posts);
      else setError(result.error);
    });
  }

  useEffect(refresh, []);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    const result = await deleteBlogPost(pendingDelete.id);
    setIsDeleting(false);
    setPendingDelete(null);
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

      <div className="mt-6 overflow-hidden rounded-lg border border-ink-800">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center">
          <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
            Title
          </span>
          <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
            Status
          </span>
          <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
            Updated
          </span>
          <span className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500" />

          {posts && posts.length === 0 && (
            <div className="col-span-4 px-4 py-10 text-center text-sm text-ink-500">
              No posts yet — click "+ New post" to write one.
            </div>
          )}

          {posts?.map((post, i) => {
            const rowBorder = i === posts.length - 1 ? "" : "border-b border-ink-900";
            return (
              <div key={post.id} className="contents">
                <Link to={`/admin/blog/${post.id}`} className={`truncate px-4 py-3 text-sm text-ink-200 hover:text-ink-50 ${rowBorder}`}>
                  {post.title}
                </Link>
                <span className={`px-4 py-3 text-sm ${rowBorder}`}>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      post.status === "published" ? "bg-accent-500/15 text-accent-400" : "bg-ink-800 text-ink-400"
                    }`}
                  >
                    {post.status}
                  </span>
                </span>
                <span className={`px-4 py-3 text-sm text-ink-500 ${rowBorder}`}>{formatDate(post.updatedAt)}</span>
                <span className={`px-4 py-3 text-right text-sm ${rowBorder}`}>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(post)}
                    className="text-[11px] text-ink-500 hover:text-red-400"
                  >
                    Delete
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

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
