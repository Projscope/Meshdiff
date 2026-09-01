import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useBlogPostMeta } from "../lib/useBlogPostMeta";
import { getBlogPost, type BlogPost } from "../lib/blogApi";
import BlogMarkdown from "../components/BlogMarkdown";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function PostMeta({ post }: { post: BlogPost }) {
  useBlogPostMeta(post);
  return null;
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setPost(null);
    setError(null);
    getBlogPost(slug).then((result) => {
      if (result.success) setPost(result.data);
      else setError(result.error);
    });
  }, [slug]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 px-6 text-center">
        <div>
          <p className="text-sm text-ink-500">{error}</p>
          <Link to="/blog" className="mt-4 inline-block text-sm text-accent-400 hover:text-accent-300">
            &larr; Back to the blog
          </Link>
        </div>
      </div>
    );
  }

  if (!post) {
    return <div className="min-h-screen bg-ink-950" />;
  }

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <PostMeta post={post} />
      <main>
        <article className="mx-auto max-w-3xl px-6 pb-20 pt-20">
          <Link to="/blog" className="text-xs font-semibold uppercase tracking-widest text-ink-500 hover:text-ink-300">
            &larr; Blog
          </Link>
          {post.publishedAt && <p className="mt-4 text-xs text-ink-500">{formatDate(post.publishedAt)}</p>}
          <h1 className="mt-2 font-display text-3xl font-bold leading-[1.15] tracking-tight text-ink-50 md:text-4xl">
            {post.title}
          </h1>
          {post.coverImageUrl && (
            <img src={post.coverImageUrl} alt="" className="mt-8 w-full rounded-xl border border-ink-800" />
          )}
          <div className="mt-10">
            <BlogMarkdown markdown={post.contentMarkdown} />
          </div>
        </article>
      </main>
    </div>
  );
}
