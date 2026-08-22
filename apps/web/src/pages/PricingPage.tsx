import { Check, Minus } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Pricing — Free, Pro, and Team Plans | Meshdiff";
export const META_DESCRIPTION =
  "Compare Meshdiff's Free, Pro, and Team plans. Core voxel and surface-heatmap diffing is free forever — Pro adds saved projects and version history, Team adds approvals, comment pins, and print logs.";

interface FeatureRow {
  label: string;
  free: boolean;
  pro: boolean;
  team: boolean;
}

// Mirrors the tier data on the homepage's #pricing section (LandingPage.tsx)
// — kept as the single source of truth for what's actually gated where, so
// this page doesn't drift into claiming a feature exists on a tier it
// doesn't. Grouped into rows instead of the homepage's per-tier bullet
// lists so the comparison itself (what's different) is the point, not the
// marketing copy around each tier.
const FEATURES: FeatureRow[] = [
  { label: "Compare STL, 3MF, and OBJ files", free: true, pro: true, team: true },
  { label: "Voxel diff (added / removed)", free: true, pro: true, team: true },
  { label: "Surface-heatmap dimensional drift", free: true, pro: true, team: true },
  { label: "Measure distance and radius tools", free: true, pro: true, team: true },
  { label: "Adjustable tolerance and cross-section", free: true, pro: true, team: true },
  { label: "Shareable links (1, 3, or 7-day expiry)", free: true, pro: true, team: true },
  { label: "Saved project workspaces", free: false, pro: true, team: true },
  { label: "Version history for every model", free: false, pro: true, team: true },
  { label: "PDF diff reports for client review", free: false, pro: true, team: true },
  { label: "Comment pins on 3D models", free: false, pro: false, team: true },
  { label: "Team approvals workflow", free: false, pro: false, team: true },
  { label: "Slicer profile snapshots and print logs", free: false, pro: false, team: true },
  { label: "Centralized billing and roles", free: false, pro: false, team: true },
];

function Cell({ included }: { included: boolean }) {
  return included ? (
    <Check size={16} weight="bold" className="mx-auto text-accent-400" />
  ) : (
    <Minus size={14} weight="bold" className="mx-auto text-ink-700" />
  );
}

export default function PricingPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <main>
        <section className="mx-auto max-w-3xl px-6 pb-10 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Pricing</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-ink-50 md:text-5xl">
            Core diffing is free forever. Pro and Team add the rest.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-400">
            Comparing two models — voxel diff, surface-heatmap drift, measuring, sharing — never requires an account
            and never will. Pro adds saved projects and version history; Team adds comment pins, approvals, and
            print-log tracking for hardware teams.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/live"
              className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-chrome-950 transition hover:bg-accent-400 active:scale-[0.98]"
            >
              Open the free diff tool
            </Link>
            <a
              href="/#pricing"
              className="rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-medium text-ink-200 transition hover:border-ink-500 active:scale-[0.98]"
            >
              Subscribe to Pro or Team
            </a>
          </div>
        </section>

        <section className="border-t border-ink-900 px-6 py-14">
          <div className="mx-auto max-w-4xl overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-800">
                  <th className="py-3 pr-4 text-left font-semibold text-ink-400">Feature</th>
                  <th className="w-24 py-3 text-center font-semibold text-ink-200">Free</th>
                  <th className="w-24 py-3 text-center font-semibold text-accent-400">Pro</th>
                  <th className="w-24 py-3 text-center font-semibold text-ink-200">Team</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((row) => (
                  <tr key={row.label} className="border-b border-ink-900">
                    <td className="py-3 pr-4 text-ink-300">{row.label}</td>
                    <td className="py-3 text-center">
                      <Cell included={row.free} />
                    </td>
                    <td className="py-3 text-center">
                      <Cell included={row.pro} />
                    </td>
                    <td className="py-3 text-center">
                      <Cell included={row.team} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-5 pr-4 font-semibold text-ink-50">Price</td>
                  <td className="pt-5 text-center font-semibold text-ink-50">$0</td>
                  <td className="pt-5 text-center font-semibold text-accent-400">$15/mo</td>
                  <td className="pt-5 text-center font-semibold text-ink-50">$35/seat/mo</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-4 text-xs text-ink-500">
              Pro and Team currently ship with a launch discount — see the live pricing on the{" "}
              <a href="/#pricing" className="text-accent-400 underline underline-offset-2 hover:text-accent-300">
                homepage
              </a>{" "}
              for the current price.
            </p>
          </div>
        </section>

        <section className="border-t border-ink-900 px-6 py-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-ink-50">Which plan is actually free?</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
              Free (Community) is the diff engine itself: drag two STL, 3MF, or OBJ files into the browser and get a
              real voxel and surface-heatmap comparison, with measuring tools and shareable links — no account, no
              time limit, no watermark on the comparison. It's not a trial; it's the free tier, permanently.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
              Pro and Team don't change how the comparison itself works — they add what happens around it: saved
              project history so you're not re-uploading files to compare each new revision, comment pins for
              feedback tied to a 3D point, a team approval workflow, and print-log tracking (slicer profile
              snapshots, print-result photos) per version.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link
                to="/docs"
                className="rounded border border-ink-700 px-4 py-2 text-xs font-medium text-ink-300 hover:border-ink-500 hover:text-ink-50 transition-colors"
              >
                Docs & FAQ
              </Link>
              <Link
                to="/3d-print-version-control"
                className="rounded border border-ink-700 px-4 py-2 text-xs font-medium text-ink-300 hover:border-ink-500 hover:text-ink-50 transition-colors"
              >
                3D Print Version Control
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
