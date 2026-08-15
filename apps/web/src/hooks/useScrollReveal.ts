import { useEffect, useRef } from "react";

/**
 * Attach the returned ref to a container; every direct-or-nested child
 * marked `data-animate` starts hidden (via the `.reveal` CSS class in
 * index.css) and fades/slides in, staggered by sibling order, the first
 * time it scrolls into view.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const elements = Array.from(container.querySelectorAll<HTMLElement>("[data-animate]"));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = elements.indexOf(entry.target as HTMLElement);
          setTimeout(() => entry.target.classList.add("is-visible"), Math.max(index, 0) * 90);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return ref;
}
