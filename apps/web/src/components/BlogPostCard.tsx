import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Image } from "@phosphor-icons/react";
import type { BlogPost } from "../lib/blogApi";

export function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Falls back to a plain-text snippet of the post body when no excerpt is
 * set, so the card never shows an empty gap under the title/date. */
export function previewText(post: BlogPost): string | null {
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

interface BlogPostCardProps {
  post: BlogPost;
  to: string;
  /** Rendered inline after the date — e.g. a draft/published status badge. */
  badge?: ReactNode;
  /** Rendered at the bottom-right of the card — e.g. admin row actions.
   * May contain its own links/buttons, so the card itself is NOT an <a> —
   * nesting interactive elements/anchors inside an anchor is invalid HTML
   * and breaks click targeting. Navigation on card click is handled via
   * useNavigate instead. */
  actions?: ReactNode;
}

/** The single shared post-summary layout: image (or placeholder) on the
 * left, title/date/preview on the right. Used by both the public blog
 * index and the admin blog list so a post looks the same in both places. */
export default function BlogPostCard({ post, to, badge, actions }: BlogPostCardProps) {
  const navigate = useNavigate();
  const preview = previewText(post);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(to)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(to);
      }}
      className="relative flex min-h-[168px] cursor-pointer gap-5 rounded-xl border border-ink-800 bg-ink-900 p-6 transition hover:border-ink-700"
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
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-ink-50">{post.title}</h2>
        <p className="mt-1 flex items-center gap-2 text-xs text-ink-500">
          <span>{post.publishedAt ? formatPostDate(post.publishedAt) : formatPostDate(post.updatedAt)}</span>
          {badge}
        </p>
        {preview && <p className="mt-3 text-sm leading-relaxed text-ink-400">{preview}</p>}
      </div>
      {actions && (
        <div className="absolute bottom-4 right-4" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
