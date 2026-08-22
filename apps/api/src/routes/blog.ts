import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../lib/requireAuth.js";
import { requireAdmin } from "../lib/requireAdmin.js";
import { requireSupabase } from "../lib/requireSupabase.js";
import { sanitizeFilename, extensionOf } from "../lib/filename.js";

const BUCKET = "blog-assets";
const PAGE_SIZE = 10;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov"]);

interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_markdown: string;
  cover_image_path: string | null;
  status: "draft" | "published";
  author_user_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

function publicAssetUrl(supabase: SupabaseClient, path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function toPublicPost(row: BlogPostRow, supabase: SupabaseClient) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    contentMarkdown: row.content_markdown,
    coverImageUrl: row.cover_image_path ? publicAssetUrl(supabase, row.cover_image_path) : null,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function blogRoute(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSupabase);

  // ---- Public ----

  app.get<{ Querystring: { page?: string } }>("/blog/posts", async (request, reply) => {
    const supabase = request.supabase!;
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
    const from = (page - 1) * PAGE_SIZE;

    const { data, error, count } = await supabase
      .from("blog_posts")
      .select("*", { count: "exact" })
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      app.log.error(error, "Failed to list blog posts");
      reply.code(502);
      return { success: false, error: "Failed to load posts" };
    }

    return {
      success: true,
      data: {
        posts: (data as BlogPostRow[]).map((row) => toPublicPost(row, supabase)),
        total: count ?? 0,
      },
    };
  });

  app.get<{ Params: { slug: string } }>("/blog/posts/:slug", async (request, reply) => {
    const supabase = request.supabase!;
    const { data, error } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", request.params.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) {
      app.log.error(error, "Failed to load blog post");
      reply.code(502);
      return { success: false, error: "Failed to load post" };
    }
    if (!data) {
      reply.code(404);
      return { success: false, error: "Post not found" };
    }
    return { success: true, data: toPublicPost(data as BlogPostRow, supabase) };
  });

  // ---- Admin ----

  app.get<{ Querystring: { page?: string } }>(
    "/admin/blog/posts",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
      const from = (page - 1) * PAGE_SIZE;

      const { data, error, count } = await supabase
        .from("blog_posts")
        .select("*", { count: "exact" })
        .order("updated_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        app.log.error(error, "Failed to list blog posts for admin");
        reply.code(502);
        return { success: false, error: "Failed to load posts" };
      }

      return {
        success: true,
        data: {
          posts: (data as BlogPostRow[]).map((row) => toPublicPost(row, supabase)),
          total: count ?? 0,
        },
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/admin/blog/posts/:id",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const { data, error } = await supabase.from("blog_posts").select("*").eq("id", request.params.id).maybeSingle();
      if (error) {
        app.log.error(error, "Failed to load blog post for admin");
        reply.code(502);
        return { success: false, error: "Failed to load post" };
      }
      if (!data) {
        reply.code(404);
        return { success: false, error: "Post not found" };
      }
      return { success: true, data: toPublicPost(data as BlogPostRow, supabase) };
    },
  );

  interface CreatePostBody {
    title?: string;
    slug?: string;
  }

  app.post<{ Body: CreatePostBody }>(
    "/admin/blog/posts",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const { title, slug } = request.body ?? {};
      if (typeof title !== "string" || !title.trim()) {
        reply.code(400);
        return { success: false, error: "title is required" };
      }
      if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
        reply.code(400);
        return { success: false, error: "slug must be lowercase letters, numbers, and hyphens only" };
      }

      const { data, error } = await supabase
        .from("blog_posts")
        .insert({ title: title.trim(), slug, author_user_id: request.userId })
        .select("*")
        .single();
      if (error) {
        reply.code(error.code === "23505" ? 409 : 502);
        return { success: false, error: error.code === "23505" ? "That slug is already in use" : "Failed to create post" };
      }
      return { success: true, data: toPublicPost(data as BlogPostRow, supabase) };
    },
  );

  interface UpdatePostBody {
    title?: string;
    slug?: string;
    excerpt?: string | null;
    contentMarkdown?: string;
    coverImagePath?: string | null;
    status?: "draft" | "published";
  }

  app.patch<{ Params: { id: string }; Body: UpdatePostBody }>(
    "/admin/blog/posts/:id",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const { title, slug, excerpt, contentMarkdown, coverImagePath, status } = request.body ?? {};

      if (slug !== undefined && !SLUG_PATTERN.test(slug)) {
        reply.code(400);
        return { success: false, error: "slug must be lowercase letters, numbers, and hyphens only" };
      }
      if (status !== undefined && status !== "draft" && status !== "published") {
        reply.code(400);
        return { success: false, error: "status must be draft or published" };
      }

      const { data: current, error: lookupError } = await supabase
        .from("blog_posts")
        .select("status, published_at")
        .eq("id", request.params.id)
        .maybeSingle();
      if (lookupError) {
        app.log.error(lookupError, "Failed to look up blog post for update");
        reply.code(502);
        return { success: false, error: "Failed to update post" };
      }
      if (!current) {
        reply.code(404);
        return { success: false, error: "Post not found" };
      }
      const currentRow = current as { status: "draft" | "published"; published_at: string | null };

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title !== undefined) update.title = title;
      if (slug !== undefined) update.slug = slug;
      if (excerpt !== undefined) update.excerpt = excerpt;
      if (contentMarkdown !== undefined) update.content_markdown = contentMarkdown;
      if (coverImagePath !== undefined) update.cover_image_path = coverImagePath;
      if (status !== undefined) {
        update.status = status;
        // published_at is set once, the first time a post goes live, and
        // never cleared by a later unpublish — re-publishing later keeps
        // its original publish date rather than looking freshly posted.
        if (status === "published" && currentRow.status !== "published" && !currentRow.published_at) {
          update.published_at = new Date().toISOString();
        }
      }

      const { data, error } = await supabase
        .from("blog_posts")
        .update(update)
        .eq("id", request.params.id)
        .select("*")
        .single();
      if (error) {
        reply.code(error.code === "23505" ? 409 : 502);
        return { success: false, error: error.code === "23505" ? "That slug is already in use" : "Failed to update post" };
      }
      return { success: true, data: toPublicPost(data as BlogPostRow, supabase) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/admin/blog/posts/:id",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const { data: row, error: lookupError } = await supabase
        .from("blog_posts")
        .select("cover_image_path")
        .eq("id", request.params.id)
        .maybeSingle();
      if (lookupError) {
        app.log.error(lookupError, "Failed to look up blog post for delete");
        reply.code(502);
        return { success: false, error: "Failed to delete post" };
      }
      if (!row) {
        reply.code(404);
        return { success: false, error: "Post not found" };
      }

      const { error: deleteError } = await supabase.from("blog_posts").delete().eq("id", request.params.id);
      if (deleteError) {
        app.log.error(deleteError, "Failed to delete blog post");
        reply.code(502);
        return { success: false, error: "Failed to delete post" };
      }

      const coverPath = (row as { cover_image_path: string | null }).cover_image_path;
      if (coverPath) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([coverPath]);
        if (storageError) app.log.warn(storageError, "Failed to remove blog cover image from storage");
      }

      return { success: true, data: true };
    },
  );

  interface AssetUploadBody {
    fileName?: string;
    fileSize?: number;
  }

  // One endpoint for both cover images and any image/video embedded inline
  // in the Markdown body (the editor inserts the returned publicUrl as
  // ![alt](url) or {{video:url}} at the cursor — see AdminBlogEditorPage.tsx).
  app.post<{ Body: AssetUploadBody }>(
    "/admin/blog/assets/upload-url",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const supabase = request.supabase!;
      const { fileName, fileSize } = request.body ?? {};
      if (typeof fileName !== "string" || !fileName) {
        reply.code(400);
        return { success: false, error: "fileName is required" };
      }
      const extension = extensionOf(fileName);
      if (!IMAGE_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension)) {
        reply.code(400);
        return { success: false, error: "File must be an image (jpg/png/webp/gif/svg) or video (mp4/webm/mov)" };
      }
      if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_ASSET_BYTES) {
        reply.code(400);
        return { success: false, error: "File must be under 50MB" };
      }

      const path = `${Date.now()}-${sanitizeFilename(fileName)}`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) {
        app.log.error(error, "Failed to create signed upload URL for blog asset");
        reply.code(502);
        return { success: false, error: "Failed to prepare upload" };
      }

      return {
        success: true,
        data: { uploadUrl: data.signedUrl, path, publicUrl: publicAssetUrl(supabase, path) },
      };
    },
  );
}
