import { useEffect } from "react";
import type { BlogPost } from "./blogApi";

const SITE_URL = "https://meshdiff.com";

/** Updates (or creates, if absent) a <meta> tag's content, returning a
 * restore function — index.html already ships Open Graph and Twitter card
 * tags with homepage-specific values as an SPA-wide fallback, so most
 * calls here update an existing tag rather than create one. */
function upsertMeta(attrName: "property" | "name", attrValue: string, content: string): () => void {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attrName}="${attrValue}"]`);
  const previous = el?.getAttribute("content") ?? null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return () => {
    if (previous !== null) el!.setAttribute("content", previous);
  };
}

function upsertLink(rel: string, href: string): () => void {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const previous = el?.getAttribute("href") ?? null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return () => {
    if (previous !== null) el!.setAttribute("href", previous);
  };
}

/**
 * Blog posts aren't in scripts/prerender.mjs's PRERENDER_ROUTES (they're
 * DB-driven, unknown at build time) — so unlike the static marketing pages,
 * a shared blog link previously got zero real Open Graph data, a canonical
 * URL, or structured data; social unfurlers and crawlers that don't
 * execute JS saw only index.html's homepage-specific defaults. This can't
 * fix the "no JS" case (that needs per-slug prerendering, out of scope
 * here), but it does mean a client that renders JS — including every
 * social platform's link-preview fetcher and Googlebot — sees the real
 * per-post title/description/image/canonical/JSON-LD once React mounts.
 *
 * Restores every tag to its previous (homepage-default) value on unmount,
 * same as useDocumentMeta, so navigating away doesn't leave stale blog
 * metadata on the next page.
 */
export function useBlogPostMeta(post: BlogPost): void {
  useEffect(() => {
    const title = `${post.title} | Meshdiff Blog`;
    const description = post.excerpt || post.title;
    const url = `${SITE_URL}/blog/${post.slug}`;
    const image = post.coverImageUrl ?? `${SITE_URL}/og-image.png`;

    const previousTitle = document.title;
    document.title = title;

    const restoreFns = [
      upsertMeta("name", "description", description),
      upsertMeta("property", "og:type", "article"),
      upsertMeta("property", "og:title", title),
      upsertMeta("property", "og:description", description),
      upsertMeta("property", "og:url", url),
      upsertMeta("property", "og:image", image),
      upsertMeta("name", "twitter:title", title),
      upsertMeta("name", "twitter:description", description),
      upsertMeta("name", "twitter:image", image),
      upsertLink("canonical", url),
    ];

    // A distinct <script id> (rather than reusing index.html's homepage
    // SoftwareApplication schema) so this can be added/removed per post
    // without touching that one — which stays in the DOM on every route in
    // this SPA regardless, a pre-existing minor imperfection this doesn't
    // attempt to fix.
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "blog-post-jsonld";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description,
      image,
      url,
      datePublished: post.publishedAt ?? post.updatedAt,
      dateModified: post.updatedAt,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      author: { "@type": "Organization", name: "Meshdiff" },
      publisher: {
        "@type": "Organization",
        name: "Meshdiff",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon-32.png` },
      },
    });
    document.head.appendChild(script);

    return () => {
      document.title = previousTitle;
      restoreFns.forEach((restore) => restore());
      script.remove();
    };
  }, [post]);
}
