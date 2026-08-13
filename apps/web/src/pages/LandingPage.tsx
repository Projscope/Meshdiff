import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle,
  ChatCircle,
  ClockCounterClockwise,
  Cube,
  GitBranch,
  LinkSimple,
  Palette,
  ShieldCheck,
  User,
  Users,
  UsersThree,
} from "@phosphor-icons/react";
import FaqAccordion from "../components/FaqAccordion";
import SectionHeader from "../components/SectionHeader";
import { useCountUp } from "../hooks/useCountUp";
import { useScrollReveal } from "../hooks/useScrollReveal";
import liveDiffPreview from "../assets/live-diff-preview.png";
import { SHOW_MONETIZATION, LAUNCH_OFFER_DEADLINE } from "../lib/featureFlags";
import { useCountdown } from "../hooks/useCountdown";
import { supabase } from "../lib/supabaseClient";
import { getSubscription } from "../lib/projectsApi";
import { markPendingProCheckout } from "../lib/pendingCheckout";
import AlreadyProModal from "../components/AlreadyProModal";

import teamsImg from '../assets/teams.png';
import proImg from '../assets/pro.jpeg';
import soloImg from '../assets/solo.png';

interface PricingTier {
  name: string;
  price: string;
  /** Struck through next to price when set — e.g. the pre-discount price. */
  originalPrice?: string;
  period: string | null;
  audience: string;
  cta: { label: string; to: string } | { label: string; scroll: true } | { label: string; checkout: true };
  highlighted: boolean;
  features: string[];
  /** Small promo pill shown above the tier name, e.g. a launch discount. */
  badge?: string;
  /** Small urgency line shown under the price, e.g. a launch-offer deadline. */
  urgency?: string;
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
      "Measure distances and radiuses tools",
      "Voxel diff, added and removed",
      "Adjustable tolerance and cross-section",
      "Shareable links, 1, 3, or 7 days",
    ],
  },
  {
    name: "Pro",
    price: "$7.50",
    originalPrice: "$15.00",
    period: "/mo",
    audience: "CAD and print engineers",
    cta: { label: "Subscribe to Pro", checkout: true },
    highlighted: true,
    badge: "Founding Member Launch Offer (50% OFF)",
    urgency: "Launch offer ends Sunday at midnight",
    features: [
      "Everything in Community",
      "Project workspaces",
      "Version history for every model",
      "PDF diff reports for client review",
    ],
  },
  {
    name: "Team",
    price: "$17.50",
    period: "/seat/mo",
    audience: "Hardware teams",
    cta: { label: "Will be available soon", scroll: true },
    highlighted: false,
    features: [
      "Everything in Pro",
      "Team approvals workflow",
      "Comment pins on 3D models",
      "Slicer profile snapshots and print logs",
      "Centralized billing and roles",
    ],
  },
];

interface HeroStat {
  target: number;
  prefix?: string;
  suffix: string;
  label: string;
}

const HERO_STATS: HeroStat[] = [
  { target: 3, suffix: "", label: "File formats: STL, 3MF, OBJ" },
  { target: 100, suffix: "%", label: "Local, private for the Community version" },
  { target: 3, suffix: "", label: "Print checks: Stable, Warn, Fail" },
  { target: 0, prefix: "$", suffix: "", label: "Free diff tool, no signup" },
];

const PROCESS_STEPS = [
  {
    number: "01",
    title: "Drop your files",
    description: "Upload two STL, 3MF, or OBJ versions — parsed entirely in your browser, nothing leaves your machine unless you share.",
  },
  {
    number: "02",
    title: "Instant voxel diff",
    description: "Meshdiff voxelizes both meshes and aligns them automatically — added geometry in green, removed in red.",
  },
  {
    number: "03",
    title: "Check printability",
    description: "Real wall-thickness, overhang, and unsupported-area analysis flags problems before you waste filament.",
  },
  {
    number: "04",
    title: "Share or approve",
    description: "Send a link for a quick review, or — on Team — route it through comments and approval before it ships.",
  },
];

const TEAM_WORKFLOW = [
  { icon: Cube, label: "Compare", detail: "Upload a new version, see the voxel diff instantly." },
  { icon: ChatCircle, label: "Pin comment", detail: "Click a spot on the model, leave feedback right there." },
  { icon: CheckCircle, label: "Approve or reject", detail: "An admin or approver signs off, with a reason if rejected." },
  { icon: ClockCounterClockwise, label: "Preserve history", detail: "Every decision stays on the record, reversible any time." },
];

const FEATURES = [
  {
    icon: Cube,
    title: "Voxel diff",
    description: "Both meshes are voxelized into a shared grid — added geometry in green, removed in red.",
    tags: ["STL", "3MF", "OBJ"],
  },
  {
    icon: Palette,
    title: "Surface heatmap",
    description: "A per-vertex signed-distance overlay shows exactly how far each surface point moved.",
    tags: ["SDF", "Per-vertex"],
  },
  {
    icon: ShieldCheck,
    title: "Printability gate",
    description: "Real wall-thickness, overhang, and unsupported-area analysis, not a placeholder check.",
    tags: ["FDM", "Pass / Warn / Fail"],
  },
  {
    icon: LinkSimple,
    title: "Shareable links",
    description: "One link reproduces the exact comparison for anyone, no account or install required.",
    tags: ["No signup", "1–7 day expiry"],
  },
  {
    icon: ChatCircle,
    title: "3D-pinned comments",
    description: "Click anywhere on a model to leave feedback right where it matters, in the Projects workspace.",
    tags: ["Projects"],
  },
  {
    icon: GitBranch,
    title: "Version history & approvals",
    description: "Every upload keeps a traceable history, with team review before it becomes the stable version.",
    tags: ["Team"],
  },
];

function HeroStatItem({ stat }: { stat: HeroStat }) {
  const { value, ref } = useCountUp(stat.target);
  return (
    <div className="text-center">
      <span className="font-mono text-2xl font-bold text-white">
        {stat.prefix}
        <span ref={ref}>{value}</span>
        <span className="text-emerald-400">{stat.suffix}</span>
      </span>
      <span className="mt-1 block text-xs text-neutral-500">{stat.label}</span>
    </div>
  );
}

export default function LandingPage() {
  const servicesRef = useScrollReveal<HTMLDivElement>();
  const processRef = useScrollReveal<HTMLDivElement>();
  const navigate = useNavigate();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [showAlreadyPro, setShowAlreadyPro] = useState(false);
  const proOfferCountdown = useCountdown(LAUNCH_OFFER_DEADLINE);

  function scrollToEarlyAccess() {
    document.getElementById("early-access")?.scrollIntoView({ behavior: "smooth" });
  }

  // Three outcomes depending on who's clicking:
  //  - Signed out: nowhere to check out into yet — send to sign-up (not
  //    sign-in; someone clicking "Subscribe" is very likely a new visitor)
  //    and remember the intent so the dashboard can resume checkout
  //    automatically once a session exists (see ProjectsLayout.tsx —
  //    handles both the immediate-session and confirm-email-first cases,
  //    since the flag survives that whole round trip in localStorage).
  //  - Signed in, already Pro: nothing to sell them — a plain "you're
  //    already subscribed" modal instead of a pointless second Checkout
  //    session.
  //  - Signed in, not Pro: same "resume on the dashboard" flag, then
  //    straight to /projects — ProjectsLayout raises the real Checkout
  //    redirect from there once it's confirmed the tier itself.
  async function handleProCheckout() {
    setIsCheckingOut(true);
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      markPendingProCheckout();
      navigate("/login?mode=signup");
      return;
    }

    const subscriptionResult = await getSubscription();
    if (subscriptionResult.success && subscriptionResult.data.tier === "pro") {
      setIsCheckingOut(false);
      setShowAlreadyPro(true);
      return;
    }

    markPendingProCheckout();
    navigate("/projects");
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main>
        
        {/* Hero: eyebrow, accent-split headline, dual CTAs, animated stat row */}
        <section className="mx-auto max-w-7xl px-6 pb-16 pt-16 md:pt-20 bg-neutral-950">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Diff &middot; Review &middot; Approve
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-5xl">
              See exactly what changed
              <br />
              <span className="text-emerald-400">between two meshes.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-neutral-400">
              A real voxel comparison on STL, 3MF, and OBJ files. Added
              geometry in green, removed in red, reviewed in seconds.
            </p>

            {/* <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
            </div> */}

          </div>

          <Link
            to="/live"
            aria-label="Open the free diff tool"
            className="group relative mx-auto mt-12 block max-w-6xl overflow-hidden rounded-xl border border-neutral-800 shadow-2xl transition hover:border-emerald-500/50"
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

          <div className="mx-auto mt-12 grid max-w-lg grid-cols-4 gap-4 border-t border-neutral-900 pt-8">
            {HERO_STATS.map((stat) => (
              <HeroStatItem key={stat.label} stat={stat} />
            ))}
          </div>

        </section>

        {/* Personas: asymmetric 1+2 grid, not three identical cards */}
        <section className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="max-w-lg text-2xl font-semibold text-white">
            Built for anyone who exports a mesh.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-12">
            {/* Hardware teams (Top-Left Aligned Text) */}
            <div
              className="relative flex flex-col justify-start items-start min-h-[480px] rounded-xl border border-emerald-500/25 bg-neutral-900 p-6 md:col-span-8 bg-cover bg-center bg-no-repeat overflow-hidden group"
              style={{ backgroundImage: `url(${teamsImg})` }}
            >
              {/* Top-down gradient overlay for top text contrast */}
              <div className="absolute inset-0 bg-gradient-to-b from-neutral-950 via-neutral-950/60 to-transparent pointer-events-none" />

              <div className="relative z-10">
                <UsersThree size={28} weight="light" className="text-emerald-400" />
                <h3 className="mt-4 text-base font-semibold text-white">Hardware teams</h3>
                <p className="mt-2 max-w-sm text-sm text-neutral-400">
                  Review revisions together, approve changes, and keep a
                  traceable history across every version anyone ships.
                </p>
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4 md:col-span-4">
              {/* Solo makers */}
              <div
                className="relative flex flex-col justify-end min-h-[230px] flex-1 rounded-xl border border-neutral-800 bg-neutral-900 p-5 bg-cover bg-center bg-no-repeat overflow-hidden"
                style={{ backgroundImage: `url(${soloImg})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent pointer-events-none" />

                <div className="relative z-10">
                  <User size={24} weight="light" className="text-neutral-400" />
                  <h3 className="mt-3 text-sm font-semibold text-white">Solo makers</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
                    Grabbed a remix off Thingiverse? See exactly what changed
                    before you commit filament.
                  </p>
                </div>
              </div>

              {/* CAD and print engineers */}
              <div
                className="relative flex flex-col justify-end min-h-[230px] flex-1 rounded-xl border border-neutral-800 bg-neutral-900 p-5 bg-cover bg-center bg-no-repeat overflow-hidden"
                style={{ backgroundImage: `url(${proImg})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent pointer-events-none" />

                <div className="relative z-10">
                  <Users size={24} weight="light" className="text-neutral-400" />
                  <h3 className="mt-3 text-sm font-semibold text-white">CAD and print engineers</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
                    Catch dimensional drift, thin walls, and unintended scaling
                    before a part fails on the bed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Services: what Meshdiff actually does, shipped today */}
        <section id="features" className="border-t border-neutral-900 px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              tag="What It Does"
              title="What Meshdiff does"
              description="Everything below runs on real geometry, computed for real — no placeholders, no fake mockups."
            />
            <div ref={servicesRef} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    data-animate
                    className="reveal rounded-xl border border-neutral-800 bg-neutral-900 p-6 transition hover:-translate-y-0.5 hover:border-neutral-700"
                  >
                    <Icon size={28} weight="light" className="text-emerald-400" />
                    <h3 className="mt-4 text-base font-semibold text-white">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-400">{feature.description}</p>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {feature.tags.map((tag) => (
                        <li
                          key={tag}
                          className="rounded-full border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-[11px] text-neutral-500"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Process: how a comparison actually flows, start to finish */}
        <section id="process" className="border-t border-neutral-900 px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <SectionHeader
              tag="How It Works"
              title="From upload to approved"
              description="A proven path from a raw file to a decision your team can stand behind."
            />
            <div ref={processRef} className="relative">
              <div
                aria-hidden="true"
                className="absolute bottom-0 left-6 top-0 w-px bg-gradient-to-b from-emerald-500 to-neutral-900"
              />
              <div className="flex flex-col gap-10">
                {PROCESS_STEPS.map((step) => (
                  <div key={step.number} data-animate className="reveal relative flex gap-6">
                    <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-neutral-700 bg-neutral-900 font-mono text-sm font-bold text-emerald-400">
                      {step.number}
                    </div>
                    <div className="pt-1.5">
                      <h3 className="text-base font-semibold text-white">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">{step.description}</p>
                    </div>
                  </div>
                ))}
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

        {/* Team workflow: compact proof block for what Team actually buys, right before pricing */}
        {SHOW_MONETIZATION && (
          <section className="border-t border-neutral-900 px-6 py-14">
            <div className="mx-auto max-w-5xl">
              <SectionHeader
                tag="For Teams"
                title="What Team unlocks"
                description="Every upload goes through the same four steps before it becomes the version everyone builds on."
              />
              <div className="grid gap-4 md:grid-cols-4">
                {TEAM_WORKFLOW.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.label} className="relative rounded-xl border border-neutral-800 bg-neutral-900 p-5">
                      <Icon size={22} weight="light" className="text-emerald-400" />
                      <h3 className="mt-3 text-sm font-semibold text-white">{step.label}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{step.detail}</p>
                      {i < TEAM_WORKFLOW.length - 1 && (
                        <ArrowRight
                          size={16}
                          weight="bold"
                          className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-neutral-700 md:block"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Pricing (hidden until Stripe billing is wired up) */}
        {SHOW_MONETIZATION && (
          <section id="pricing" className="border-t border-neutral-900 px-6 py-14">
            <div className="mx-auto max-w-5xl">
              <SectionHeader
                tag="Pricing"
                title="Diff for free. Upgrade to save, review, and share."
                description="The comparison tool is free forever. Founding members get 50% off Pro and Team for 3 months."
              />
              <div className="grid gap-4 md:grid-cols-3">
                {PRICING_TIERS.map((tier) => (
                  <div
                    key={tier.name}
                    className={`relative rounded-xl border p-6 ${tier.highlighted
                      ? "border-emerald-500 bg-neutral-900"
                      : "border-neutral-800 bg-neutral-900"
                      }`}
                  >
                    {tier.badge && (
                      <span className="absolute -top-3 left-6 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-950">
                        {tier.badge}
                      </span>
                    )}
                    <h3 className={`text-sm font-semibold ${tier.highlighted ? "text-emerald-400" : "text-neutral-300"}`}>
                      {tier.name}
                    </h3>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-white">{tier.price}</span>
                      {tier.originalPrice && (
                        <span className="text-sm text-neutral-500 line-through">{tier.originalPrice}</span>
                      )}
                      {tier.period && <span className="text-xs text-neutral-500">{tier.period}</span>}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">{tier.audience}</p>
                    {tier.urgency && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-purple-400">
                        <span className="rounded-full bg-purple-400" />
                        *{tier.urgency}
                        <span className="font-mono tabular-nums">{proOfferCountdown}</span>
                      </p>
                    )}

                    {"to" in tier.cta ? (
                      <Link
                        to={tier.cta.to}
                        className="mt-4 block w-full rounded-lg bg-emerald-500 py-2 text-center text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
                      >
                        {tier.cta.label}
                      </Link>
                    ) : "checkout" in tier.cta ? (
                      <button
                        type="button"
                        onClick={() => void handleProCheckout()}
                        disabled={isCheckingOut}
                        className="mt-4 w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/15 disabled:opacity-50"
                      >
                        {isCheckingOut ? "Redirecting…" : tier.cta.label}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={scrollToEarlyAccess}
                        className={`mt-4 w-full rounded-lg py-2 text-sm font-medium transition ${tier.highlighted
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
        )}

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

        {/* Early access / waitlist */}
        {/* <section id="early-access" className="px-6 py-20">
          <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
            <div>
              <span className="mb-3 block text-xs font-semibold uppercase tracking-widest text-emerald-500">
                Get Started
              </span>
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
        </section> */}

        {/* FAQ */}
        <section id="faq" className="px-6 py-16">
          <SectionHeader tag="Questions" title="Frequently asked" />
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

      {showAlreadyPro && <AlreadyProModal onClose={() => setShowAlreadyPro(false)} />}
    </div>
  );
}
