import { Link } from "react-router-dom";
import { Check, LinkSimple, User, Users, UsersThree } from "@phosphor-icons/react";
import WaitlistForm from "../components/WaitlistForm";
import FaqAccordion from "../components/FaqAccordion";
import liveDiffPreview from "../assets/live-diff-preview.png";

const PLANNED_FEATURES = [
  "Version history for every model",
  "Comment pins directly on 3D models",
  "Slicer profile snapshots",
  "Team approvals and PDF export",
];

interface PricingTier {
  name: string;
  price: string;
  period: string | null;
  audience: string;
  cta: { label: string; to: string } | { label: string; scroll: true };
  highlighted: boolean;
  features: string[];
}

const PRICING_TIERS: PricingTier[] = [
  {
    name: "Community",
    price: "Free",
    period: null,
    audience: "Compare any two models, right now.",
    cta: { label: "Open the diff tool", to: "/live" },
    highlighted: false,
    features: [
      "Compare OBJ, STL, and 3MF files",
      "Voxel diff, added and removed",
      "Adjustable tolerance and cross-section",
      "Shareable links, 1, 3, or 7 days",
    ],
  },
  {
    name: "Pro",
    price: "$7.50",
    period: "/mo",
    audience: "CAD and print engineers",
    cta: { label: "Join early access", scroll: true },
    highlighted: true,
    features: [
      "Everything in Community",
      "Project workspaces",
      "Version history for every model",
      "Comment pins on 3D models",
      "PDF diff reports for client review",
    ],
  },
  {
    name: "Team",
    price: "$17.50",
    period: "/seat/mo",
    audience: "Hardware teams",
    cta: { label: "Join early access", scroll: true },
    highlighted: false,
    features: [
      "Everything in Pro",
      "Team approvals workflow",
      "Slicer profile snapshots and print logs",
      "Centralized billing and roles",
    ],
  },
];

export default function LandingPage() {
  function scrollToEarlyAccess() {
    document.getElementById("early-access")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main>
        {/* Hero: asymmetric split, headline/CTA left, real product screenshot right */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-16 md:grid-cols-[1.05fr_1fr] md:pt-20  bg-neutral-950">
          <div>
            <h1 className="mt-5 max-w-xl text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-5xl">
              See exactly what changed between two meshes.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-neutral-400">
              A real voxel comparison on STL, 3MF, and OBJ files. Added
              geometry in green, removed in red, reviewed in seconds.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/live"
                className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400 active:scale-[0.98]"
              >
                Open the diff tool
              </Link>
              <button
                type="button"
                onClick={scrollToEarlyAccess}
                className="rounded-lg border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 active:scale-[0.98]"
              >
                Join early access
              </button>
            </div>
          </div>

          <Link
            to="/live"
            aria-label="Open the free diff tool"
            className="group relative block overflow-hidden rounded-xl border border-neutral-800 shadow-2xl transition hover:border-emerald-500/50"
          >
            <img
              src={liveDiffPreview}
              alt="Meshdiff Live Diff tool: side-by-side 3D viewers for Version A and Version B, with a voxel diff panel showing added and removed geometry"
              className="block w-full"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/0 opacity-0 transition group-hover:bg-neutral-950/60 group-hover:opacity-100">
              <span className="rounded-full bg-neutral-900/90 px-4 py-2 text-xs font-medium text-emerald-400 shadow-lg">
                Open the free diff tool
              </span>
            </div>
          </Link>
        </section>

        {/* Personas: asymmetric 1+2 grid, not three identical cards */}
        <section className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="max-w-lg text-2xl font-semibold text-white">
            Built for anyone who exports a mesh.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-5">
            <div className="rounded-xl border border-emerald-500/25 bg-neutral-900 p-6 md:col-span-3">
              <UsersThree size={28} weight="light" className="text-emerald-400" />
              <h3 className="mt-4 text-base font-semibold text-white">Hardware teams</h3>
              <p className="mt-2 max-w-sm text-sm text-neutral-400">
                Review revisions together, approve changes, and keep a
                traceable history across every version anyone ships.
              </p>
            </div>
            <div className="flex flex-col gap-4 md:col-span-2">
              <div className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
                <User size={24} weight="light" className="text-neutral-400" />
                <h3 className="mt-3 text-sm font-semibold text-white">Solo makers</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
                  Grabbed a remix off Thingiverse? See exactly what changed
                  before you commit filament.
                </p>
              </div>
              <div className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
                <Users size={24} weight="light" className="text-neutral-400" />
                <h3 className="mt-3 text-sm font-semibold text-white">CAD and print engineers</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
                  Catch dimensional drift, thin walls, and unintended scaling
                  before a part fails on the bed.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Sharing feature: vertical stack, no fake screenshot mockup */}
        <section className="border-t border-neutral-900 px-6 py-14">
          <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-2xl font-bold text-white">
                Send a diff, not a 40 MB attachment
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-400">
                Hit Share in the viewer toolbar and Meshdiff generates a link
                to the exact comparison, same alignment, tolerance, and view.
                Recipients open it in any browser, no account or software
                needed.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: "1 day", detail: "Quick internal check" },
                { label: "3 days", detail: "Client review window" },
                { label: "7 days", detail: "Longer async review" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
                >
                  <LinkSimple size={18} weight="light" className="shrink-0 text-emerald-400" />
                  <span className="w-14 shrink-0 text-sm font-semibold text-white">{item.label}</span>
                  <span className="text-xs text-neutral-500">{item.detail}</span>
                </div>
              ))}
              <p className="mt-1 text-xs text-neutral-600">
                Links expire automatically. Free on the Community plan.
              </p>
            </div>
          </div>
        </section>

        {/* Testimonial */}
        <section className="border-t border-neutral-900 px-6 py-14">
          <div className="mx-auto max-w-2xl">
            <p className="text-lg leading-relaxed text-neutral-200">
              "Version control for 3D models has always been awkward, since a
              diff of two binary STLs tells you nothing useful. Meshdiff does
              the job properly."
            </p>
            <a
              href="https://blog.adafruit.com/2026/08/03/meshdiff-see-exactly-what-changed-between-two-3d-models"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-3"
            >
              <img src="https://blog.adafruit.com/app/themes/adafruit2013/images/logos/logo_2x.png" alt="Adafruit" className="h-8 w-auto" />
            </a>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-neutral-900 px-6 py-14">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-2xl font-semibold text-white">
              Diff for free. Upgrade to save, review, and share.
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-neutral-400">
              The comparison tool is free forever. Founding members get 50%
              off Pro and Team for 3 months.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {PRICING_TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className={`rounded-xl border p-6 ${
                    tier.highlighted
                      ? "border-emerald-500 bg-neutral-900"
                      : "border-neutral-800 bg-neutral-900"
                  }`}
                >
                  <h3 className={`text-sm font-semibold ${tier.highlighted ? "text-emerald-400" : "text-neutral-300"}`}>
                    {tier.name}
                  </h3>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold text-white">{tier.price}</span>
                    {tier.period && <span className="text-xs text-neutral-500">{tier.period}</span>}
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{tier.audience}</p>

                  {"to" in tier.cta ? (
                    <Link
                      to={tier.cta.to}
                      className="mt-4 block w-full rounded-lg bg-emerald-500 py-2 text-center text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
                    >
                      {tier.cta.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={scrollToEarlyAccess}
                      className={`mt-4 w-full rounded-lg py-2 text-sm font-medium transition ${
                        tier.highlighted
                          ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                          : "border border-neutral-700 text-neutral-300 hover:border-neutral-500"
                      }`}
                    >
                      {tier.cta.label}
                    </button>
                  )}

                  <ul className="mt-5 flex flex-col gap-2 text-xs text-neutral-400">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check size={14} weight="bold" className="mt-0.5 shrink-0 text-emerald-400" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Early access / waitlist */}
        <section id="early-access" className="border-t border-neutral-900 px-6 py-16">
          <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold leading-tight text-white md:text-4xl">
                Save projects, track versions, and review with your team.
              </h2>
              <p className="mt-3 max-w-md text-sm text-neutral-400">
                The diff engine ships today. Pro and Team are launching soon,
                built in the open with early-access members shaping what
                lands next.
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-sm text-neutral-300">
                {PLANNED_FEATURES.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-emerald-500/40 bg-emerald-500/10">
                      <Check size={12} weight="bold" className="text-emerald-400" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-neutral-900 p-8">
              <p className="text-sm font-semibold text-white">Claim your founding spot</p>
              <p className="mt-1 text-xs text-neutral-500">
                50% off Pro and Team for 3 months, before public launch.
              </p>
              <div className="mt-4">
                <WaitlistForm />
              </div>
              <p className="mt-4 text-center text-xs text-neutral-500">
                No spam. One launch email, then you decide.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-neutral-900 px-6 py-16">
          <h2 className="text-center text-2xl font-semibold text-white">
            Frequently asked
          </h2>
          <div className="mt-8">
            <FaqAccordion />
          </div>
          <p className="mt-6 text-center text-xs text-neutral-500">
            Still curious?{" "}
            <button type="button" onClick={scrollToEarlyAccess} className="text-emerald-400 hover:text-emerald-300">
              Join early access
            </button>
          </p>
        </section>
      </main>
    </div>
  );
}
