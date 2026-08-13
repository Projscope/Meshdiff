import { Link } from "react-router-dom";
import { Check } from "@phosphor-icons/react";
import { useScrollReveal } from "../hooks/useScrollReveal";
import liveDiffPreview from "../assets/live-diff-preview.png";

interface FeatureSection {
  tag: string;
  title: string;
  description: string;
  bullets: string[];
}

// The one feature with a real screenshot today (see the hero's own image)
// gets the full rich treatment below; the rest render as text-only cards
// rather than shipping placeholder/fake screenshots for features that
// don't have a real one yet.
const HERO_FEATURE: FeatureSection = {
  tag: "The diff engine",
  title: "See every change, not just a file size.",
  description:
    "Both meshes are voxelized into a shared grid and compared cell by cell — added geometry in green, removed in red. No manual overlay, no guessing what moved.",
  bullets: [
    "Computed off the main thread, never freezes the viewer",
    "Works on STL, 3MF, and OBJ",
    "Adjustable tolerance for press-fit vs. clearance",
  ],
};

const OTHER_FEATURES: FeatureSection[] = [
  {
    tag: "The heatmap",
    title: "See exactly how far a surface moved.",
    description:
      "A per-vertex signed-distance overlay shows dimensional drift as a gradient, not just a bounding-box number.",
    bullets: [
      "BVH-accelerated nearest-point sampling",
      "Green = pushed out, red = pulled in",
      "Ghost overlay catches fully-removed material",
    ],
  },
  {
    tag: "Printability",
    title: "Catch a failed print before you start it.",
    description:
      "Real wall-thickness, overhang, and unsupported-area analysis on every version — not a placeholder checkbox.",
    bullets: [
      "Pass / Warn / Fail gate, tuned for FDM",
      "Flags walls under 0.8mm",
      "Flags unsupported overhangs past 45°–55°",
    ],
  },
  {
    tag: "Sharing",
    title: "Send a diff, not a 40MB attachment.",
    description:
      "One link reproduces the exact comparison — same alignment, tolerance, and view — for anyone, no account or install required.",
    bullets: ["1, 3, or 7-day expiry", "No signup for the recipient", "Free on the Community plan"],
  },
  {
    tag: "Review",
    title: "Leave feedback right where it matters.",
    description:
      "Click anywhere on a model to pin a comment to that exact 3D point, not a vague line number or a screenshot.",
    bullets: ["Comments stay attached to the surface", "Full history in the Projects workspace"],
  },
  {
    tag: "History",
    title: "Every upload keeps a real trail.",
    description:
      "A traceable version history with team review — pending, approved, or rejected — before a file becomes the stable version everyone builds on.",
    bullets: [
      "Team approval workflow (admin / approver roles)",
      "Rejection reasons kept on record",
      "Stable-version resolution for downloads",
    ],
  },
  {
    tag: "Community",
    title: "Free forever — no account, no install.",
    description:
      "The full diff engine is free for anyone. Drop two files into the browser tool and get a real comparison — no signup, no credit card, and nothing leaves your machine unless you choose to share it.",
    bullets: [
      "Compare STL, 3MF, and OBJ files, unlimited",
      "Measure distances and radii right in the viewer",
      "No account needed to use it",
    ],
  },
];

export default function FeaturesPage() {
  const gridRef = useScrollReveal<HTMLDivElement>();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 pb-14 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500">Features</p>
          <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl">
            Everything you need
            <br />
            to catch what changed.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-neutral-400">
            No CAD plugin, no manual overlay, no guesswork — Meshdiff reads two STL, 3MF, or OBJ files and gives
            you a real diff.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/live"
              className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400 active:scale-[0.98]"
            >
              Open the diff tool
            </Link>
            <a
              href="/#pricing"
              className="rounded-lg border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 active:scale-[0.98]"
            >
              See pricing
            </a>
          </div>
        </section>

        {/* Hero feature: the one row with a real screenshot */}
        <section className="border-t border-neutral-900 px-6 py-16">
          <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
            <div>
              <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                {HERO_FEATURE.tag}
              </span>
              <h2 className="mt-4 text-2xl font-bold leading-tight text-white md:text-3xl">{HERO_FEATURE.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">{HERO_FEATURE.description}</p>
              <ul className="mt-5 flex flex-col gap-2.5 text-sm text-neutral-300">
                {HERO_FEATURE.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5">
                    <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-emerald-400" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-xl border border-neutral-800 shadow-2xl">
              <img
                src={liveDiffPreview}
                alt="Meshdiff's voxel diff viewer: side-by-side 3D versions with an added/removed geometry panel"
                className="block w-full"
              />
            </div>
          </div>
        </section>

        {/* The rest: text-only cards, no placeholder screenshots */}
        <section className="border-t border-neutral-900 px-6 py-16">
          <div ref={gridRef} className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
            {OTHER_FEATURES.map((feature) => (
              <div
                key={feature.tag}
                data-animate
                className="reveal rounded-xl border border-neutral-800 bg-neutral-900 p-6"
              >
                <span className="inline-block rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  {feature.tag}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">{feature.description}</p>
                <ul className="mt-4 flex flex-col gap-2 text-xs text-neutral-300">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <Check size={14} weight="bold" className="mt-0.5 shrink-0 text-emerald-400" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-neutral-900 px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-white">Ready to see what changed?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
            Drop two files into the free diff tool — no account, nothing leaves your browser.
          </p>
          <Link
            to="/live"
            className="mt-6 inline-block rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400 active:scale-[0.98]"
          >
            Open the diff tool
          </Link>
        </section>
      </main>
    </div>
  );
}
