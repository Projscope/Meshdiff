import { Link } from "react-router-dom";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import PricingCards from "../components/PricingCards";

export const META_TITLE = "Pricing — Free, Pro, and Team Plans | Meshdiff";
export const META_DESCRIPTION =
  "Compare Meshdiff's Free, Pro, and Team plans. Core diffing is free forever — Pro adds versioning history, comments, and saved comparisons; Team adds shared workspaces and review workflows.";

export default function PricingPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <main>
        <section className="mx-auto max-w-3xl px-6 pb-10 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Pricing</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-ink-50 md:text-5xl">
            Pricing
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-400">
            Core diffing is free, forever, no account required. Pro and Team add the features that come up once
            you're comparing models regularly or working with other people.
          </p>
        </section>

        <section className="border-t border-ink-900 px-6 py-14">
          <div className="mx-auto max-w-5xl">
            <PricingCards />
          </div>
        </section>

        <section className="border-t border-ink-900 px-6 py-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-ink-50">A note on privacy</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
              Diffing itself always happens client-side, in your browser — that doesn't change on Pro or Team.
              Versioning history and comments on paid plans are stored so they can persist across sessions and be
              shared with teammates; your model files are never sent to a third party.
            </p>
          </div>
        </section>

        <section className="border-t border-ink-900 px-6 py-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-ink-50">FAQ</h2>
            <div className="mt-6 flex flex-col gap-8">
              <div>
                <h3 className="text-base font-semibold text-ink-50">Do I need an account for the Free plan?</h3>
                <p className="mt-2 text-sm text-ink-300">
                  No. Free requires no sign-up — just open Meshdiff and start comparing.
                </p>
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-50">Can I upgrade or downgrade at any time?</h3>
                <p className="mt-2 text-sm text-ink-300">
                  Yes, plans can be changed at any time; downgrading simply removes access to versioning history,
                  comments, and team features going forward.
                </p>
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-50">
                  Is there a limit to file size or number of comparisons on Free?
                </h3>
                <p className="mt-2 text-sm text-ink-300">
                  No comparison limit on the free Live Diff tool. File size isn't capped either — parsing and
                  voxelizing happen entirely in your browser, so the practical ceiling is whatever memory your
                  browser tab has available. (Pro/Team Projects workspace uploads, which are stored server-side, do
                  have a 50MB file size cap — see the{" "}
                  <Link to="/docs" className="text-accent-400 underline underline-offset-2 hover:text-accent-300">
                    FAQ
                  </Link>{" "}
                  for details.)
                </p>
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink-50">
                  What happens to my saved comparisons if I downgrade from Pro?
                </h3>
                <p className="mt-2 text-sm text-ink-300">
                  Your existing history is retained but becomes read-only until you upgrade again.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
