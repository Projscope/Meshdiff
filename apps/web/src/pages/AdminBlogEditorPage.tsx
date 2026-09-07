import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createBlogPost,
  deleteBlogPost,
  getAdminBlogPost,
  getBlogAssetUploadUrl,
  slugify,
  updateBlogPost,
  type BlogPost,
} from "../lib/blogApi";
import { uploadVersionBytes } from "../lib/projectsApi";
import BlogMarkdown from "../components/BlogMarkdown";

/** Google typically shows ~50-160 characters of a meta description before
 * truncating with an ellipsis — this is guidance, not a hard rule (Google
 * sometimes ignores it and generates its own snippet from the page body
 * regardless), but staying in range gives the excerpt the best chance of
 * showing up intact in a search result. */
function excerptSeoHint(length: number): { label: string; className: string } {
  if (length === 0) return { label: "no meta description set", className: "text-ink-600" };
  if (length < 50) return { label: "a bit short for a search snippet", className: "text-amber-400" };
  if (length <= 160) return { label: "good length for a search snippet", className: "text-accent-fg-400" };
  return { label: "may get truncated in search results", className: "text-amber-400" };
}

/** Handles both /admin/blog/new (id === "new") and /admin/blog/:id (editing
 * a real post) in one page — a brand-new post is just a title+slug form
 * until the first save creates the row, at which point the URL is swapped
 * to the real id (via navigate(..., {replace:true})) so a refresh doesn't
 * lose it or accidentally create a second post. */
export default function AdminBlogEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [post, setPost] = useState<BlogPost | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [coverImagePath, setCoverImagePath] = useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNew || !id) return;
    getAdminBlogPost(id).then((result) => {
      if (!result.success) {
        setError(result.error);
        return;
      }
      const p = result.data;
      setPost(p);
      setTitle(p.title);
      setSlug(p.slug);
      setSlugTouched(true);
      setExcerpt(p.excerpt ?? "");
      setContentMarkdown(p.contentMarkdown);
      setCoverImageUrl(p.coverImageUrl);
    });
  }, [id, isNew]);

  async function handleCreate() {
    if (!title.trim() || !slug.trim()) return;
    setIsSaving(true);
    setError(null);
    const result = await createBlogPost(title.trim(), slug.trim());
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setPost(result.data);
    navigate(`/admin/blog/${result.data.id}`, { replace: true });
  }

  async function handleSave(status?: "draft" | "published") {
    if (!post) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    const result = await updateBlogPost(post.id, {
      title,
      slug,
      excerpt: excerpt || null,
      contentMarkdown,
      coverImagePath,
      ...(status ? { status } : {}),
    });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setPost(result.data);
    setNotice(status === "published" ? "Published." : status === "draft" ? "Unpublished — saved as draft." : "Saved.");
  }

  async function handleDelete() {
    if (!post) return;
    if (!window.confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    const result = await deleteBlogPost(post.id);
    if (result.success) navigate("/admin/blog");
    else setError(result.error);
  }

  async function uploadAsset(file: File): Promise<string | null> {
    setIsUploading(true);
    setError(null);
    const urlResult = await getBlogAssetUploadUrl(file);
    if (!urlResult.success) {
      setError(urlResult.error);
      setIsUploading(false);
      return null;
    }
    const uploaded = await uploadVersionBytes(urlResult.data.uploadUrl, file);
    setIsUploading(false);
    if (!uploaded.success) {
      setError(uploaded.error);
      return null;
    }
    return urlResult.data.publicUrl;
  }

  async function handleCoverUpload(file: File) {
    const urlResult = await getBlogAssetUploadUrl(file);
    if (!urlResult.success) {
      setError(urlResult.error);
      return;
    }
    setIsUploading(true);
    const uploaded = await uploadVersionBytes(urlResult.data.uploadUrl, file);
    setIsUploading(false);
    if (!uploaded.success) {
      setError(uploaded.error);
      return;
    }
    setCoverImagePath(urlResult.data.path);
    setCoverImageUrl(urlResult.data.publicUrl);
  }

  /** Inserts `snippet` at the textarea's current cursor position (replacing
   * any selection), or appends it as a new paragraph if the textarea isn't
   * mounted yet (e.g. still in Preview mode) — shared by the image/video
   * upload, link, and image-URL toolbar actions below. */
  function insertAtCursor(snippet: string) {
    const textarea = contentRef.current;
    if (!textarea) {
      setContentMarkdown((prev) => `${prev}\n\n${snippet}\n`);
      return;
    }
    const { selectionStart, selectionEnd, value } = textarea;
    const next = `${value.slice(0, selectionStart)}${snippet}${value.slice(selectionEnd)}`;
    setContentMarkdown(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = selectionStart + snippet.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  /** Wraps the current selection in `before`/`after` (Bold/Italic/inline
   * code) — a placeholder stands in for an empty selection so there's
   * still something between the markers to type over, and that
   * placeholder ends up selected so typing immediately replaces it. */
  function wrapSelection(before: string, after: string, placeholder: string) {
    const textarea = contentRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const selected = value.slice(selectionStart, selectionEnd) || placeholder;
    const next = `${value.slice(0, selectionStart)}${before}${selected}${after}${value.slice(selectionEnd)}`;
    setContentMarkdown(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart + before.length, selectionStart + before.length + selected.length);
    });
  }

  /** Prepends `prefix` to the start of every line touched by the current
   * selection — headings, blockquote, and list markers all work this way
   * in Markdown, applied to the whole selected block at once rather than
   * just the cursor's own line. */
  function prefixLines(prefix: string) {
    const textarea = contentRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const nextNewline = value.indexOf("\n", selectionEnd);
    const lineEnd = nextNewline === -1 ? value.length : nextNewline;
    const block = value.slice(lineStart, lineEnd);
    const prefixed = block
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
    const next = `${value.slice(0, lineStart)}${prefixed}${value.slice(lineEnd)}`;
    setContentMarkdown(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + prefixed.length);
    });
  }

  /** Cmd/Ctrl+B and Cmd/Ctrl+I — the keyboard shortcut a rich-text editor
   * is expected to support, on top of the toolbar buttons below. */
  function handleContentKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key === "b") {
      event.preventDefault();
      wrapSelection("**", "**", "bold text");
    } else if (event.key === "i") {
      event.preventDefault();
      wrapSelection("_", "_", "italic text");
    }
  }

  async function handleInlineUpload(file: File) {
    const publicUrl = await uploadAsset(file);
    if (!publicUrl) return;
    const isVideo = /\.(mp4|webm|mov)$/i.test(file.name);
    if (isVideo) {
      insertAtCursor(`{{video:${publicUrl}}}`);
      return;
    }
    // Alt text matters for both accessibility and image-search SEO — the
    // filename ("IMG_2043.jpg") that used to land here by default is
    // useless for either, same reasoning as the Image URL flow below.
    const alt = window.prompt("Alt text (for accessibility and SEO):", "") ?? "";
    insertAtCursor(`![${alt}](${publicUrl})`);
  }

  /** Wraps the current selection (if any) as link text, otherwise inserts a
   * generic placeholder — either way the URL itself is always asked for. */
  function handleInsertLink() {
    const url = window.prompt("Link URL:");
    if (!url?.trim()) return;
    const textarea = contentRef.current;
    const selected = textarea ? textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) : "";
    const text = selected || window.prompt("Link text:", url) || url;
    insertAtCursor(`[${text}](${url.trim()})`);
  }

  /** Same idea as "+ Insert image/video" but for an image already hosted
   * elsewhere — no upload needed, just the URL. */
  function handleInsertImageUrl() {
    const url = window.prompt("Image URL:");
    if (!url?.trim()) return;
    const alt = window.prompt("Alt text (optional, for accessibility/SEO):", "") ?? "";
    insertAtCursor(`![${alt}](${url.trim()})`);
  }

  if (error && !post && !isNew) {
    return <div className="p-6 text-sm text-red-400">{error}</div>;
  }

  if (isNew && !post) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold text-ink-50">New post</h1>
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-ink-500">Title</label>
            <input
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (!slugTouched) setSlug(slugify(event.target.value));
              }}
              className="mt-1.5 w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
              placeholder="What the post is about"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-ink-500">
              Slug — meshdiff.com/blog/<span className="text-ink-300">{slug || "..."}</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(slugify(event.target.value));
              }}
              className="mt-1.5 w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!title.trim() || !slug.trim() || isSaving}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
          >
            {isSaving ? "Creating…" : "Create draft"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-50">Edit post</h1>
          {post && (
            <span
              className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                post.status === "published" ? "bg-accent-500/15 text-accent-fg-400" : "bg-ink-800 text-ink-400"
              }`}
            >
              {post.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {notice && <span className="text-xs text-ink-500">{notice}</span>}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded border border-ink-700 px-3 py-1.5 text-sm text-ink-200 hover:border-ink-500 disabled:opacity-50"
          >
            Save
          </button>
          {post?.status === "published" ? (
            <button
              type="button"
              onClick={() => void handleSave("draft")}
              disabled={isSaving}
              className="rounded border border-ink-700 px-3 py-1.5 text-sm text-ink-200 hover:border-ink-500 disabled:opacity-50"
            >
              Unpublish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSave("published")}
              disabled={isSaving}
              className="rounded-lg bg-accent-500 px-3.5 py-1.5 text-sm font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
            >
              Publish
            </button>
          )}
          <button type="button" onClick={() => void handleDelete()} className="text-sm text-ink-500 hover:text-red-400">
            Delete
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Post title"
            className="w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-lg font-semibold text-ink-50 focus:border-accent-500 focus:outline-none"
          />

          {!showPreview && (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-ink-800 bg-ink-950/70 p-1">
              <button
                type="button"
                onClick={() => wrapSelection("**", "**", "bold text")}
                title="Bold (Ctrl/Cmd+B)"
                className="flex h-7 w-7 items-center justify-center rounded text-sm font-bold text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => wrapSelection("_", "_", "italic text")}
                title="Italic (Ctrl/Cmd+I)"
                className="flex h-7 w-7 items-center justify-center rounded text-sm italic text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              >
                I
              </button>
              <button
                type="button"
                onClick={() => wrapSelection("`", "`", "code")}
                title="Inline code"
                className="flex h-7 w-7 items-center justify-center rounded font-mono text-xs text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              >
                {"</>"}
              </button>
              <div className="mx-0.5 h-5 w-px bg-ink-800" />
              <button
                type="button"
                onClick={() => prefixLines("## ")}
                title="Heading"
                className="flex h-7 w-7 items-center justify-center rounded text-xs font-bold text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              >
                H2
              </button>
              <button
                type="button"
                onClick={() => prefixLines("### ")}
                title="Subheading"
                className="flex h-7 w-7 items-center justify-center rounded text-xs font-bold text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              >
                H3
              </button>
              <button
                type="button"
                onClick={() => prefixLines("> ")}
                title="Blockquote"
                className="flex h-7 w-7 items-center justify-center rounded text-base text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              >
                &ldquo;
              </button>
              <button
                type="button"
                onClick={() => prefixLines("- ")}
                title="Bullet list"
                className="flex h-7 w-7 items-center justify-center rounded text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              >
                •&nbsp;—
              </button>
              <button
                type="button"
                onClick={() => prefixLines("1. ")}
                title="Numbered list"
                className="flex h-7 w-7 items-center justify-center rounded text-xs text-ink-300 hover:bg-ink-800 hover:text-ink-50"
              >
                1.
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-500">Content (Markdown)</span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleInsertLink} className="text-xs text-accent-fg-400 hover:text-accent-fg-300">
                + Insert link
              </button>
              <button type="button" onClick={handleInsertImageUrl} className="text-xs text-accent-fg-400 hover:text-accent-fg-300">
                + Image URL
              </button>
              <button
                type="button"
                onClick={() => inlineInputRef.current?.click()}
                disabled={isUploading}
                className="text-xs text-accent-fg-400 hover:text-accent-fg-300 disabled:opacity-50"
              >
                {isUploading ? "Uploading…" : "+ Upload image/video"}
              </button>
              <button
                type="button"
                onClick={() => setShowPreview((prev) => !prev)}
                className="text-xs text-ink-400 hover:text-ink-200"
              >
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>
            <input
              ref={inlineInputRef}
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleInlineUpload(file);
                event.target.value = "";
              }}
            />
          </div>

          {showPreview ? (
            <div className="min-h-[400px] rounded border border-ink-800 bg-ink-900 p-4">
              <BlogMarkdown markdown={contentMarkdown} />
            </div>
          ) : (
            <textarea
              ref={contentRef}
              value={contentMarkdown}
              onChange={(event) => setContentMarkdown(event.target.value)}
              onKeyDown={handleContentKeyDown}
              placeholder={"Write in Markdown — separate paragraphs with a blank line. Use \"+ Insert link\" for links, \"+ Image URL\" for an already-hosted image, or \"+ Upload image/video\" to upload one, or embed a YouTube/Vimeo link inline with {{video:https://youtube.com/watch?v=...}}"}
              className="h-[400px] w-full rounded border border-ink-800 bg-ink-900 p-4 font-mono text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
            />
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-ink-500">
              Slug — /blog/<span className="text-ink-300">{slug}</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(event) => setSlug(slugify(event.target.value))}
              className="mt-1.5 w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-semibold uppercase tracking-widest text-ink-500">Excerpt</label>
              <span className={`text-[11px] ${excerptSeoHint(excerpt.length).className}`}>
                {excerpt.length} chars — {excerptSeoHint(excerpt.length).label}
              </span>
            </div>
            <textarea
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
              placeholder="Shown on the blog index and used as the meta description"
              className="mt-1.5 h-20 w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-ink-500">Cover image</label>
            {coverImageUrl ? (
              <div className="mt-1.5">
                <img src={coverImageUrl} alt="" className="w-full rounded-lg border border-ink-800" />
                <button
                  type="button"
                  onClick={() => {
                    setCoverImagePath(null);
                    setCoverImageUrl(null);
                  }}
                  className="mt-1.5 text-[11px] text-ink-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={isUploading}
                className="mt-1.5 w-full rounded border border-dashed border-ink-700 py-6 text-xs text-ink-400 hover:border-ink-500 disabled:opacity-50"
              >
                {isUploading ? "Uploading…" : "+ Upload cover image"}
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleCoverUpload(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
