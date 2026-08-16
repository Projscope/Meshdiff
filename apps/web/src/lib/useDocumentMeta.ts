import { useEffect } from "react";

/**
 * Sets document.title and <meta name="description"> for the current route
 * — this SPA has no per-route head management otherwise (index.html only
 * has one static title), so dedicated SEO landing pages need this to
 * actually differentiate themselves for search engines. Restores the
 * previous title/description on unmount so navigating to a page without
 * its own meta doesn't leave a stale one behind.
 */
export function useDocumentMeta(title: string, description: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.getAttribute("content") ?? null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", description);

    return () => {
      document.title = previousTitle;
      if (previousDescription !== null) {
        meta?.setAttribute("content", previousDescription);
      }
    };
  }, [title, description]);
}
