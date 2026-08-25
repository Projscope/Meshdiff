import { request, type Result } from "./projectsApi";

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentMarkdown: string;
  coverImageUrl: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string;
}

export interface BlogPostsPage {
  posts: BlogPost[];
  total: number;
}

export function listBlogPosts(page = 1): Promise<Result<BlogPostsPage>> {
  return request(`/blog/posts?page=${page}`);
}

export function getBlogPost(slug: string): Promise<Result<BlogPost>> {
  return request(`/blog/posts/${slug}`);
}

/** All-time pageview count for `/blog/:slug`, from the self-hosted
 * analytics rollup (see apps/api/src/lib/analyticsStats.ts's
 * getPageviewCountsByPath()) — 0 if analytics has no data for it yet. */
export interface AdminBlogPost extends BlogPost {
  views: number;
}

export interface AdminBlogPostsPage {
  posts: AdminBlogPost[];
  total: number;
}

export function listAdminBlogPosts(page = 1): Promise<Result<AdminBlogPostsPage>> {
  return request(`/admin/blog/posts?page=${page}`);
}

export function getAdminBlogPost(id: string): Promise<Result<BlogPost>> {
  return request(`/admin/blog/posts/${id}`);
}

export function createBlogPost(title: string, slug: string): Promise<Result<BlogPost>> {
  return request("/admin/blog/posts", { method: "POST", body: JSON.stringify({ title, slug }) });
}

export interface BlogPostUpdate {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  contentMarkdown?: string;
  coverImagePath?: string | null;
  status?: "draft" | "published";
}

export function updateBlogPost(id: string, update: BlogPostUpdate): Promise<Result<BlogPost>> {
  return request(`/admin/blog/posts/${id}`, { method: "PATCH", body: JSON.stringify(update) });
}

export function deleteBlogPost(id: string): Promise<Result<true>> {
  return request(`/admin/blog/posts/${id}`, { method: "DELETE" });
}

export interface BlogAssetUpload {
  uploadUrl: string;
  path: string;
  publicUrl: string;
}

export function getBlogAssetUploadUrl(file: File): Promise<Result<BlogAssetUpload>> {
  return request("/admin/blog/assets/upload-url", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
  });
}

/** Slugify a title into a URL-safe default — the editor pre-fills this but
 * lets the author override it before the first save. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
