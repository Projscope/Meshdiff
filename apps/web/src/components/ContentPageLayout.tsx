import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";

interface RelatedLink {
  to: string;
  label: string;
}

interface ContentPageLayoutProps {
  eyebrow: string;
  h1: string;
  dek: string;
  cta: { label: string; to: string };
  /** Internal links to at least 2 other content pages, per the SEO brief —
   * rendered as a card row above the closing CTA. */
  related: RelatedLink[];
  children: ReactNode;
}

/**
 * Shared shell for the long-form SEO content pages (/stl-diff, /3mf-diff,
 * /obj-diff, /3d-print-version-control, /vs-manual-comparison, /docs). Keeps
 * heading hierarchy, prose measure, and CTA/related-links placement
 * consistent across all of them instead of re-implementing per page.
 */
export default function ContentPageLayout({ eyebrow, h1, dek, cta, related, children }: ContentPageLayoutProps) {
  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <main>
        <section className="mx-auto max-w-3xl px-6 pb-10 pt-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">{eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-ink-50 md:text-5xl">
            {h1}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-400">{dek}</p>
          <div className="mt-8">
            <Link
              to={cta.to}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-chrome-950 transition hover:bg-accent-400 active:scale-[0.98]"
            >
              {cta.label}
              <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
        </section>

        <section className="border-t border-ink-900 px-6 py-14">
          <div className="mx-auto max-w-3xl text-[15px] leading-relaxed text-ink-300">{children}</div>
        </section>

        {related.length > 0 && (
          <section className="border-t border-ink-900 px-6 py-14">
            <div className="mx-auto max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">Related</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {related.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-900 px-4 py-3 text-sm font-medium text-ink-200 transition hover:border-ink-700 hover:text-ink-50"
                  >
                    {link.label}
                    <ArrowRight size={14} weight="bold" className="shrink-0 text-ink-500" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="border-t border-ink-900 px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-ink-50">Ready to see what changed?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">
            Drop two files into the free diff tool — no account, nothing leaves your browser.
          </p>
          <Link
            to={cta.to}
            className="mt-6 inline-block rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-chrome-950 transition hover:bg-accent-400 active:scale-[0.98]"
          >
            {cta.label}
          </Link>
        </section>
      </main>
    </div>
  );
}
