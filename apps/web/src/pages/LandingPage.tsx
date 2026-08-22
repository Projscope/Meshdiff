import { useState, useEffect, lazy, Suspense } from "react";
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
import liveDiffPreviewWebp from "../assets/live-diff-preview.webp";
import { SHOW_MONETIZATION, LAUNCH_OFFER_DEADLINE } from "../lib/featureFlags";
import { useCountdown } from "../hooks/useCountdown";
import { supabase } from "../lib/supabaseClient";
import { getSubscription } from "../lib/projectsApi";
import { markPendingProCheckout } from "../lib/pendingCheckout";
import AlreadyProModal from "../components/AlreadyProModal";

// R3F/Three.js/the voxel-diff worker only download once someone actually
// clicks to try the demo (see the click-to-activate state below) — an
// always-embedded version of this previously got pulled from this exact
// page for its page-weight cost (three.js vendor chunk 77-82% unused on
// first paint, per the Lighthouse audit that drove the original removal).
const LandingLiveDemo = lazy(() => import("../components/LandingLiveDemo"));

import teamsImg from '../assets/teams.webp';
import proImg from '../assets/pro.jpeg';
import soloImg from '../assets/solo.webp';

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
    badge: "Early Subscriber Offer (50% OFF × 1 months)",
    urgency: "Launch offer: 50% off first month. Ends Sunday at midnight.",
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

interface DemoHistoryRow {
  title: string;
  description: string;
  added: number | null;
  removed: number | null;
  addedPercent: number;
  removedPercent: number;
  failed: boolean;
  time: string;
}

// Illustrates the real Projects History view (ProjectDetailPage.tsx) with
// made-up demo data — not tied to any account, purely decorative in the
// hero.
const DEMO_HISTORY_ROWS: DemoHistoryRow[] = [
  {
    title: "v3 → v4",
    description: "Volume increased by 359,162 mm³ (294.2%). Bounding box changed by 100.1 × 80.6 × 70.2 mm.",
    added: 3860,
    removed: 886,
    addedPercent: 81,
    removedPercent: 19,
    failed: true,
    time: "4d ago",
  },
  {
    title: "v2 → v3",
    description: "Volume increased by 120,097 mm³ (1779.2%). Bounding box changed by 33.3 × 63.5 × 29.8 mm.",
    added: 902,
    removed: 48,
    addedPercent: 95,
    removedPercent: 5,
    failed: true,
    time: "4d ago",
  },
  {
    title: "v1 → v2",
    description: "Volume increased by 1,640 mm³ (42.9%). Bounding box changed by 0.0 × 4.0 × 0.0 mm. Printability: pass.",
    added: 6264,
    removed: 1218,
    addedPercent: 84,
    removedPercent: 16,
    failed: false,
    time: "5d ago",
  },
  {
    title: "v1",
    description: "Initial upload",
    added: null,
    removed: null,
    addedPercent: 0,
    removedPercent: 0,
    failed: false,
    time: "5d ago",
  },
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
      <span className="font-mono text-2xl font-bold text-ink-50">
        {stat.prefix}
        <span ref={ref}>{value}</span>
        <span className="text-accent-400">{stat.suffix}</span>
      </span>
      <span className="mt-1 block text-xs text-ink-400">{stat.label}</span>
    </div>
  );
}

export default function LandingPage() {
  const servicesRef = useScrollReveal<HTMLDivElement>();
  const processRef = useScrollReveal<HTMLDivElement>();
  const navigate = useNavigate();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [showAlreadyPro, setShowAlreadyPro] = useState(false);
  // ?demo=open auto-activates the hero demo on load — a testing/sharing
  // convenience (e.g. re-running a Lighthouse pass against the "always
  // embedded" case), not something surfaced to real visitors. Default
  // behavior (click-to-activate) is unchanged for everyone else.
  const [isDemoActive, setIsDemoActive] = useState(
    // typeof window guard: this component is also rendered in Node during
    // the build-time prerender pass (see scripts/prerender.mjs).
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "open",
  );
  const proOfferCountdown = useCountdown(LAUNCH_OFFER_DEADLINE);

  function scrollToEarlyAccess() {
    document.getElementById("early-access")?.scrollIntoView({ behavior: "smooth" });
  }

  function scrollToPricing() {
    const pricingSection = document.getElementById("pricing");
    if (pricingSection) {
      pricingSection.scrollIntoView({ behavior: "smooth" });
    }
  }

  // Handle hash-based navigation from roadmap page
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "#pricing") {
      // Use setTimeout to ensure DOM is fully rendered
      setTimeout(() => {
        scrollToPricing();
      }, 300);
    }
  }, []);

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
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <main>
        
        {/* Hero: eyebrow pill, accent-split headline, dual CTAs, HUD demo panel */}
        <section className="mx-auto max-w-7xl px-6 pb-16 pt-16 md:pt-20 bg-ink-950">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-300">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                3D_Model_Diff &middot; Client-Side
              </span>
              <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink-50 md:text-5xl">
                See exactly what <span className="text-accent-400">changed</span> between two model versions.
              </h1>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink-400">
                Meshdiff computes voxel and surface-heatmap diffs of STL, 3MF, and OBJ files —
                added material, removed material, and dimensional drift, down to the millimetre.
                Everything runs in your browser. Nothing is uploaded.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/live"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-chrome-950 transition hover:bg-accent-400 active:scale-[0.98]"
                >
                  Try it in your browser
                  <ArrowRight size={16} weight="bold" />
                </Link>
                <a
                  href="#process"
                  className="rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-medium text-ink-200 transition hover:border-ink-500 active:scale-[0.98]"
                >
                  How it works
                </a>
              </div>

              <p className="mt-5 flex items-center gap-1.5 text-xs text-ink-500">
                <ShieldCheck size={14} weight="fill" className="text-accent-400" />
                No account &middot; No install &middot; Files never leave your machine
              </p>
            </div>

            {/* Static decorative panel — no click/link. Illustrates the real
                Projects History view (see ProjectDetailPage.tsx) with demo
                data; not wired to any account. */}
            <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                <span>History</span>
                <span>Updated</span>
              </div>

              {DEMO_HISTORY_ROWS.map((row, index) => (
                <div
                  key={row.title}
                  className="flex items-stretch gap-3 border-b border-ink-800 px-4 py-3 text-sm last:border-b-0"
                >
                  <div className="flex w-3 shrink-0 flex-col items-center">
                    <div className={`w-px flex-1 ${index === 0 ? "bg-transparent" : "bg-ink-800"}`} />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-400" />
                    <div className={`w-px flex-1 ${index === DEMO_HISTORY_ROWS.length - 1 ? "bg-transparent" : "bg-ink-800"}`} />
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-4 py-0.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-semibold text-ink-50">{row.title}</span>
                        {row.failed && (
                          <span title="Printability check failed" className="text-red-400">
                            &#10005;
                          </span>
                        )}
                      </div>
                      <span className="block truncate text-xs text-ink-500">{row.description}</span>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        {row.added !== null ? (
                          <>
                            <div className="whitespace-nowrap font-mono text-xs">
                              <span className="text-accent-400">+{row.added.toLocaleString()}</span>{" "}
                              <span className="text-red-400">-{row.removed!.toLocaleString()}</span>
                            </div>
                            <div className="mt-1 flex h-1 w-16 overflow-hidden rounded-full bg-ink-800">
                              <div className="bg-accent-500" style={{ width: `${row.addedPercent}%` }} />
                              <div className="bg-red-500" style={{ width: `${row.removedPercent}%` }} />
                            </div>
                          </>
                        ) : (
                          <span className="whitespace-nowrap font-mono text-xs text-ink-500">12 tris</span>
                        )}
                      </div>
                      <span className="rounded border border-accent-800 bg-accent-500/10 px-2 py-0.5 text-[11px] font-medium text-accent-400">
                        Approved
                      </span>
                      <span className="whitespace-nowrap text-xs text-ink-500">{row.time}</span>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                <span className="font-semibold uppercase tracking-widest text-ink-500">Compare any two</span>
                <span className="rounded border border-ink-700 bg-ink-950 px-2 py-1.5 text-ink-200">
                  v4 — Planter_Hearth_60mm.3mf
                </span>
                <span className="text-ink-600">&rarr;</span>
                <span className="rounded border border-ink-700 bg-ink-950 px-2 py-1.5 text-ink-200">
                  v5 — bracket-v2.stl
                </span>
                <span className="ml-auto rounded bg-accent-500 px-3 py-1.5 font-medium text-chrome-950">
                  Compare
                </span>
              </div>
            </div>
          </div>

          {/* Live tool preview, restored in its original click-to-activate
              form: static screenshot until clicked, then the real tool
              lazy-loads in (see LandingLiveDemo.tsx's own comment for why
              this stays deferred rather than always-embedded). */}
          <div className="mx-auto mt-12 max-w-6xl">
            {isDemoActive ? (
              <Suspense
                fallback={
                  <div className="flex h-[320px] items-center justify-center rounded-xl border border-ink-800 bg-ink-900 text-sm text-ink-400 shadow-2xl sm:h-[380px]">
                    Loading the live demo…
                  </div>
                }
              >
                <LandingLiveDemo />
              </Suspense>
            ) : (
              <button
                type="button"
                onClick={() => setIsDemoActive(true)}
                aria-label="Try the live diff demo"
                className="group relative block w-full overflow-hidden rounded-xl border border-ink-800 shadow-2xl transition hover:border-ink-600"
              >
                <picture>
                  <source srcSet={liveDiffPreviewWebp} type="image/webp" />
                  <img
                    src={liveDiffPreview}
                    alt="Meshdiff Live Diff tool: side-by-side 3D viewers for Version A and Version B, with a voxel diff panel showing added and removed geometry"
                    className="block w-full"
                    fetchPriority="high"
                    width={1200}
                    height={801}
                  />
                </picture>
                <div className="absolute inset-0 flex items-center justify-center bg-ink-950/0 opacity-0 transition group-hover:bg-ink-950/60 group-hover:opacity-100">
                  <span className="rounded-full bg-ink-900/90 px-4 py-2 text-xs font-medium text-accent-400 shadow-lg">
                    &#9654; Try it live, right here
                  </span>
                </div>
              </button>
            )}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-ink-900 pt-8 text-xs text-ink-500">
            <span className="font-mono uppercase tracking-widest text-ink-500">Reads_Natively</span>
            <span className="rounded border border-ink-700 px-2 py-1 font-mono text-ink-300">.stl</span>
            <span className="rounded border border-ink-700 px-2 py-1 font-mono text-ink-300">.3mf</span>
            <span className="rounded border border-ink-700 px-2 py-1 font-mono text-ink-300">.obj</span>
            <span>Binary or ASCII &middot; WebAssembly + WebGL</span>
          </div>

          <div className="mx-auto mt-8 grid max-w-lg grid-cols-4 gap-4 border-t border-ink-900 pt-8">
            {HERO_STATS.map((stat) => (
              <HeroStatItem key={stat.label} stat={stat} />
            ))}
          </div>

        </section>

        {/* Personas: asymmetric 1+2 grid, not three identical cards */}
        <section className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="max-w-lg text-2xl font-semibold text-ink-50">
            Built for anyone who exports a mesh.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-12">
            {/* Hardware teams (Top-Left Aligned Text) */}
            <div
              className="relative flex flex-col justify-start items-start min-h-[480px] rounded-xl border border-ink-700 bg-ink-900 p-6 md:col-span-8 bg-cover bg-center bg-no-repeat overflow-hidden group"
              style={{ backgroundImage: `url(${teamsImg})` }}
            >
              {/* Top-down gradient overlay for top text contrast */}
              <div className="absolute inset-0 bg-gradient-to-b from-ink-950 via-ink-950/60 to-transparent pointer-events-none" />

              <div className="relative z-10">
                <UsersThree size={28} weight="light" className="text-ink-400" />
                <h3 className="mt-4 text-base font-semibold text-ink-50">Hardware teams</h3>
                <p className="mt-2 max-w-sm text-sm text-ink-400">
                  Review revisions together, approve changes, and keep a
                  traceable history across every version anyone ships.
                </p>
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4 md:col-span-4">
              {/* Solo makers */}
              <div
                className="relative flex flex-col justify-end min-h-[230px] flex-1 rounded-xl border border-ink-800 bg-ink-900 p-5 bg-cover bg-center bg-no-repeat overflow-hidden"
                style={{ backgroundImage: `url(${soloImg})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent pointer-events-none" />

                <div className="relative z-10">
                  <User size={24} weight="light" className="text-ink-400" />
                  <h3 className="mt-3 text-sm font-semibold text-ink-50">Solo makers</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
                    Grabbed a remix off Thingiverse? See exactly what changed
                    before you commit filament.
                  </p>
                </div>
              </div>

              {/* CAD and print engineers */}
              <div
                className="relative flex flex-col justify-end min-h-[230px] flex-1 rounded-xl border border-ink-800 bg-ink-900 p-5 bg-cover bg-center bg-no-repeat overflow-hidden"
                style={{ backgroundImage: `url(${proImg})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent pointer-events-none" />

                <div className="relative z-10">
                  <Users size={24} weight="light" className="text-ink-400" />
                  <h3 className="mt-3 text-sm font-semibold text-ink-50">CAD and print engineers</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
                    Catch dimensional drift, thin walls, and unintended scaling
                    before a part fails on the bed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Services: what Meshdiff actually does, shipped today */}
        <section id="features" className="border-t border-ink-900 px-6 py-16">
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
                    className="reveal rounded-xl border border-ink-800 bg-ink-900 p-6 transition hover:-translate-y-0.5 hover:border-ink-700"
                  >
                    <Icon size={28} weight="light" className="text-ink-400" />
                    <h3 className="mt-4 text-base font-semibold text-ink-50">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-400">{feature.description}</p>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {feature.tags.map((tag) => (
                        <li
                          key={tag}
                          className="rounded-full border border-ink-800 bg-ink-950 px-2.5 py-1 text-[11px] text-ink-400"
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
        <section id="process" className="border-t border-ink-900 px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <SectionHeader
              tag="How It Works"
              title="From upload to approved"
              description="A proven path from a raw file to a decision your team can stand behind."
            />
            <div ref={processRef} className="relative">
              <div
                aria-hidden="true"
                className="absolute bottom-0 left-6 top-0 w-px bg-gradient-to-b from-ink-700 to-ink-900"
              />
              <div className="flex flex-col gap-10">
                {PROCESS_STEPS.map((step) => (
                  <div key={step.number} data-animate className="reveal relative flex gap-6">
                    <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-ink-700 bg-ink-900 font-mono text-sm font-bold text-ink-300">
                      {step.number}
                    </div>
                    <div className="pt-1.5">
                      <h3 className="text-base font-semibold text-ink-50">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Sharing feature: vertical stack, no fake screenshot mockup */}
        <section className="border-t border-ink-900 px-6 py-14">
          <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-2xl font-bold text-ink-50">
                Send a diff, not a 40 MB attachment
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-400">
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
                  className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900 px-4 py-3"
                >
                  <LinkSimple size={18} weight="light" className="shrink-0 text-ink-400" />
                  <span className="w-14 shrink-0 text-sm font-semibold text-ink-50">{item.label}</span>
                  <span className="text-xs text-ink-400">{item.detail}</span>
                </div>
              ))}
              <p className="mt-1 text-xs text-ink-400">
                Links expire automatically. Free on the Community plan.
              </p>
            </div>
          </div>
        </section>

        {/* Team workflow: compact proof block for what Team actually buys, right before pricing */}
        {SHOW_MONETIZATION && (
          <section className="border-t border-ink-900 px-6 py-14">
            <div className="mx-auto max-w-5xl">
              <SectionHeader
                tag="For Teams"
                title="What Team unlocks (we will release it soon)"
                description="Every upload goes through the same four steps before it becomes the version everyone builds on."
              />
              <div className="grid gap-4 md:grid-cols-4">
                {TEAM_WORKFLOW.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.label} className="relative rounded-xl border border-ink-800 bg-ink-900 p-5">
                      <Icon size={22} weight="light" className="text-ink-400" />
                      <h3 className="mt-3 text-sm font-semibold text-ink-50">{step.label}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{step.detail}</p>
                      {i < TEAM_WORKFLOW.length - 1 && (
                        <ArrowRight
                          size={16}
                          weight="bold"
                          className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-ink-700 md:block"
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
          <section id="pricing" className="border-t border-ink-900 px-6 py-14">
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
                      ? "border-accent-500 bg-ink-900"
                      : "border-ink-800 bg-ink-900"
                      }`}
                  >
                    {tier.badge && (
                      <span className="absolute -top-3 left-6 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-chrome-950">
                        {tier.badge}
                      </span>
                    )}
                    <h3 className={`text-sm font-semibold ${tier.highlighted ? "text-accent-400" : "text-ink-300"}`}>
                      {tier.name}
                    </h3>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-ink-50">{tier.price}</span>
                      {tier.originalPrice && (
                        <span className="text-sm text-ink-400 line-through">{tier.originalPrice}</span>
                      )}
                      {tier.period && <span className="text-xs text-ink-400">{tier.period}</span>}
                    </div>
                    <p className="mt-1 text-xs text-ink-400">{tier.audience}</p>
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
                        className="mt-4 block w-full rounded-lg bg-accent-500 py-2 text-center text-sm font-medium text-chrome-950 transition hover:bg-accent-400"
                      >
                        {tier.cta.label}
                      </Link>
                    ) : "checkout" in tier.cta ? (
                      <button
                        type="button"
                        onClick={() => void handleProCheckout()}
                        disabled={isCheckingOut}
                        className="mt-4 w-full rounded-lg border border-accent-500/40 bg-accent-500/10 py-2 text-sm font-medium text-accent-400 transition hover:bg-accent-500/15 disabled:opacity-50"
                      >
                        {isCheckingOut ? "Redirecting…" : tier.cta.label}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={scrollToEarlyAccess}
                        className={`mt-4 w-full rounded-lg py-2 text-sm font-medium transition ${tier.highlighted
                          ? "border border-accent-500/40 bg-accent-500/10 text-accent-400 hover:bg-accent-500/15"
                          : "border border-ink-700 text-ink-300 hover:border-ink-500"
                          }`}
                      >
                        {tier.cta.label}
                      </button>
                    )}
                    <ul className="mt-5 flex flex-col gap-2 text-xs text-ink-400">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <Check size={14} weight="bold" className="mt-0.5 shrink-0 text-accent-400" />
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
        <section className="border-t border-ink-900 px-6 py-14">
          <div className="mx-auto max-w-2xl">
            <p className="text-lg leading-relaxed text-ink-200">
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
              <img
                src="https://blog.adafruit.com/app/themes/adafruit2013/images/logos/logo_2x.png"
                alt="Adafruit"
                className="h-8 w-auto"
                width={92}
                height={32}
              />
            </a>
          </div>
        </section>

        {/* Early access / waitlist */}
        {/* <section id="early-access" className="px-6 py-20">
          <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
            <div>
              <span className="mb-3 block text-xs font-semibold uppercase tracking-widest text-accent-500">
                Get Started
              </span>
              <h2 className="text-3xl font-bold leading-tight text-ink-50 md:text-4xl">
                Save projects, track versions, and review with your team.
              </h2>
              <p className="mt-3 max-w-md text-sm text-ink-400">
                The diff engine ships today. Pro and Team are launching soon,
                built in the open with early-access members shaping what
                lands next.
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-sm text-ink-300">
                {PLANNED_FEATURES.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-accent-500/40 bg-accent-500/10">
                      <Check size={12} weight="bold" className="text-accent-400" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-accent-500/20 bg-ink-900 p-8">
              <p className="text-sm font-semibold text-ink-50">Claim your founding spot</p>
              <p className="mt-1 text-xs text-ink-400">
                50% off Pro and Team for 3 months, before public launch.
              </p>
              <div className="mt-4">
                <WaitlistForm />
              </div>
              <p className="mt-4 text-center text-xs text-ink-400">
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
          <div className="mt-8 flex justify-center gap-3">
            <a
              href="/live"
              className="rounded border border-ink-700 px-4 py-2 text-xs font-medium text-ink-300 hover:border-ink-500 hover:text-ink-50 transition-colors"
            >
              Try free tool
            </a>
            <button
              type="button"
              onClick={scrollToPricing}
              className="rounded bg-accent-700 px-4 py-2 text-xs font-medium text-ink-50 hover:bg-accent-800 transition-colors"
            >
              View pricing
            </button>
          </div>
        </section>
      </main>

      {showAlreadyPro && <AlreadyProModal onClose={() => setShowAlreadyPro(false)} />}
    </div>
  );
}
