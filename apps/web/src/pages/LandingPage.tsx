import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Buildings,
  ChatCircle,
  CheckCircle,
  Circle,
  Cube,
  Factory,
  GitBranch,
  LinkSimple,
  Palette,
  PaperPlaneTilt,
  Printer,
  Rocket,
  ShieldCheck,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";
import FaqAccordion from "../components/FaqAccordion";
import SectionHeader from "../components/SectionHeader";
import PricingCards from "../components/PricingCards";
import ApprovalBadge, { APPROVAL_DOT_COLOR } from "../components/ApprovalBadge";
import { useCountUp } from "../hooks/useCountUp";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { SHOW_MONETIZATION } from "../lib/featureFlags";
import revisionCtaImg from "../assets/teams.webp";

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
  added: number;
  removed: number;
  addedPercent: number;
  removedPercent: number;
  status: "changes_requested" | "in_review" | "approved";
  time: string;
}

// The hero's decorative panel — illustrates the real Projects History view
// (ProjectDetailPage.tsx): same row layout, same status dot/badge colors
// (ApprovalBadge.tsx / APPROVAL_DOT_COLOR), with the exact numbers from a
// real seeded "Robot Housing" project (v13 Changes Requested, v14 In
// Review, v15 Approved), not an invented mockup.
const DEMO_HISTORY_ROWS: DemoHistoryRow[] = [
  {
    title: "v14 → v15",
    description: "Volume increased by 1,768 mm³ (6.7%). Bounding box changed by 2.0 × 0.0 × 0.0 mm.",
    added: 782,
    removed: 0,
    addedPercent: 100,
    removedPercent: 0,
    status: "approved",
    time: "5m ago",
  },
  {
    title: "v13 → v14",
    description: "Volume increased by 3,000 mm³ (12.5%). Bounding box changed by 0.0 × 0.0 × 2.0 mm.",
    added: 1536,
    removed: 0,
    addedPercent: 100,
    removedPercent: 0,
    status: "in_review",
    time: "5m ago",
  },
  {
    title: "v13",
    description: "Wall thickness near the mounting boss dropped to 0.6mm — changes requested.",
    added: 0,
    removed: 0,
    addedPercent: 0,
    removedPercent: 0,
    status: "changes_requested",
    time: "5m ago",
  },
];

// The comment shown under the history panel — a single, concrete example
// of "discuss it, then decide" rather than an abstract feature list.
const DEMO_COMMENT = {
  author: "Alex",
  body: "This wall looks too thin.",
};

// Second panel, right below the hero — the 3D-diff viewport (added/removed
// geometry + a comment pin, same red-circle-with-📍 marker CommentPin.tsx
// renders in the real viewer), a short comment thread, and an
// approval-gate checklist with an Approve action.
const DEMO_COMMENTS = [
  { author: "Alex", body: "Wall thickness is too thin here." },
  { author: "Sarah", body: "Fixed in v18." },
];

const DEMO_GATES: Array<{ label: string; done: boolean }> = [
  { label: "Geometry reviewed", done: true },
  { label: "Printability checked", done: true },
  { label: "Manufacturing review", done: false },
];

// Merges what used to be two separate sections (a numbered "how it works"
// process and a "Built for 3D design reviews" feature-card grid) — same
// four-step story, told once. Each step answers the question an engineer
// actually has at that point: What changed? What needs fixing? Was it
// fixed? Can we manufacture it?
const WORKFLOW_STEPS = [
  {
    number: "01",
    icon: Cube,
    label: "Compare",
    question: "What changed?",
    detail: "See exactly what was added, removed, or modified.",
  },
  {
    number: "02",
    icon: ChatCircle,
    label: "Discuss",
    question: "What needs fixing?",
    detail: "Pin comments directly to the geometry.",
  },
  {
    number: "03",
    icon: Buildings,
    label: "Resolve",
    question: "Was it fixed?",
    detail: "Track feedback across revisions.",
  },
  {
    number: "04",
    icon: CheckCircle,
    label: "Approve",
    question: "Is this the one we manufacture?",
    detail: "Give the team a clear final revision.",
  },
];

const MESSY_FILENAMES = [
  "bracket_final.stl",
  "bracket_final_v2.stl",
  "bracket_final_v2_REAL.stl",
  "bracket_final_USE_THIS_ONE.stl",
];

type RevisionStatus = "superseded" | "changes_requested" | "in_review" | "approved";

// Same dot-and-connecting-line "commit graph" the real Projects History
// view renders (see ProjectDetailPage.tsx / APPROVAL_DOT_COLOR) — v12 is
// shown as superseded (the 5th review state) since v16 is now the current
// approved version, so all 5 states appear across the timeline. v14 shows
// a comment count instead of a badge — people, not just states, moving a
// revision forward. This is what makes it an engineering workflow rather
// than plain version control: someone requested changes, the team argued
// it out in the comments, someone re-reviewed, someone approved.
const REVISION_TIMELINE: Array<{
  version: string;
  description: string;
  status: RevisionStatus;
  commentCount?: number;
}> = [
  { version: "v12", description: "Superseded once v16 was approved.", status: "superseded" },
  { version: "v13", description: "Wall thickness dropped to 0.6mm near the mounting boss.", status: "changes_requested" },
  { version: "v14", description: "Alex and Sarah discussed the fix.", status: "in_review", commentCount: 3 },
  { version: "v15", description: "Wall thickened, awaiting sign-off.", status: "in_review" },
  { version: "v16", description: "Approved — the version everyone builds on.", status: "approved" },
];

const AUDIENCES = [
  {
    icon: Rocket,
    title: "Hardware Startups",
    description: "Review prototype revisions quickly without adding another heavyweight CAD system.",
  },
  {
    icon: Buildings,
    title: "Engineering Teams",
    description: "Keep design-review discussions tied to the actual geometry.",
  },
  {
    icon: Printer,
    title: "3D Printing Teams",
    description: "Know exactly which revision is ready to print.",
  },
  {
    icon: Factory,
    title: "Manufacturers",
    description: "Review customer revisions without requiring CAD software.",
  },
];

const FEATURES = [
  {
    icon: Cube,
    title: "Geometry diff",
    description: "See exactly what was added or removed between two versions, highlighted in green and red.",
    tags: ["STL", "3MF", "OBJ"],
  },
  {
    icon: Palette,
    title: "Surface heatmap",
    description: "See how far the surface actually moved, down to the millimeter, everywhere it changed.",
    tags: ["High precision"],
  },
  {
    icon: ShieldCheck,
    title: "Printability check",
    description: "Thin walls, steep overhangs, and unsupported areas get flagged automatically, before you print.",
    tags: ["FDM", "Pass / Warn / Fail"],
  },
  {
    icon: LinkSimple,
    title: "Shareable links",
    description: "Share one link and anyone sees the exact same comparison — no account, no install.",
    tags: ["No signup", "1–7 day expiry"],
  },
  {
    icon: ChatCircle,
    title: "3D-pinned comments",
    description: "Click anywhere on the model to leave feedback exactly where it matters.",
    tags: ["Projects"],
  },
  {
    icon: GitBranch,
    title: "Version history & approvals",
    description: "Every upload is saved, with your team's review built in before anything ships.",
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
        <span className="text-accent-fg-400">{stat.suffix}</span>
      </span>
      <span className="mt-1 block text-xs text-ink-400">{stat.label}</span>
    </div>
  );
}

const ANIMATION_STEPS = [
  { icon: UploadSimple, label: "Upload v17" },
  { icon: Cube, label: "Compare" },
  { icon: ChatCircle, label: "📍 Comment" },
  { icon: UploadSimple, label: "Upload v18" },
  { icon: CheckCircle, label: "Resolve" },
  { icon: CheckCircle, label: "Approve" },
];

const ANIMATION_STEP_MS = 2000;

/** A tiny, looping "how it works" sequence — no video, no marketing
 * animation, just the actual product's own steps advancing on a timer.
 * Six steps at 2s each is a ~12s loop, in the 10-15s range that's long
 * enough to read without feeling frozen. */
// Vertical dot-and-line timeline — same visual language as the Revision
// History panel below (APPROVAL_DOT_COLOR's dot-on-a-line pattern), so this
// reads as a sibling of that panel, not an unrelated new widget. Its own
// section, right after the 4-step workflow cards, since it's illustrating
// exactly what that section just described.
function WorkflowAnimation() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % ANIMATION_STEPS.length);
    }, ANIMATION_STEP_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
      {ANIMATION_STEPS.map((step, index) => {
        const Icon = step.icon;
        const isActive = index === activeIndex;
        return (
          <div key={`${step.label}-${index}`} className="flex flex-1 items-stretch gap-3 px-4 py-2.5">
            <div className="flex w-3 shrink-0 flex-col items-center">
              <div className={`w-px flex-1 ${index === 0 ? "bg-transparent" : "bg-ink-800"}`} />
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-500 ${
                  isActive ? "bg-accent-400" : "bg-ink-700"
                }`}
              />
              <div className={`w-px flex-1 ${index === ANIMATION_STEPS.length - 1 ? "bg-transparent" : "bg-ink-800"}`} />
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <Icon
                size={14}
                weight={isActive ? "fill" : "light"}
                className={`shrink-0 transition-colors duration-500 ${isActive ? "text-accent-fg-400" : "text-ink-600"}`}
              />
              <span
                className={`text-xs transition-colors duration-500 ${
                  isActive ? "font-semibold text-ink-50" : "text-ink-500"
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The product-visualization panel: a 3D-diff viewport, comment thread, and
 * approval checklist (see ProjectDetailPage.tsx / VersionDetailPage.tsx /
 * ApprovalGateChecklist.tsx) with demo data — not wired to any account.
 * Used both in the hero and as the standalone "product visualization" block
 * right below it, so the two don't drift apart. The comment pin reuses
 * CommentPin.tsx's exact red-circle-with-📍 marker for visual consistency. */
function BracketAssemblyPanel() {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900 px-4 py-2.5">
        <div>
          <span className="block text-sm font-semibold text-ink-50">Bracket Assembly</span>
          <span className="block font-mono text-[11px] text-ink-500">v17 &rarr; v18</span>
        </div>
        <ApprovalBadge status="in_review" />
      </div>

      {/* Abstract 3D-diff viewport: green = added geometry, red = removed,
          with a comment pin over the changed region. */}
      <div className="relative h-40 overflow-hidden bg-ink-950">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff08 1px, transparent 1px), linear-gradient(to bottom, #ffffff08 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
        <div className="absolute left-[18%] top-1/2 h-20 w-20 -translate-y-1/2 rounded-full bg-red-500/25 blur-lg" />
        <div className="absolute left-[30%] top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-accent-500/25 blur-lg" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Cube size={56} weight="thin" className="text-ink-700" />
        </div>
        <div className="absolute left-[38%] top-[38%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-red-400 bg-red-500 text-[10px] shadow-sm">
            📍
          </span>
          <span className="rounded-sm bg-ink-950/90 px-1.5 py-0.5 text-[10px] font-medium text-ink-200 shadow-sm">
            #12
          </span>
        </div>
      </div>

      {/* Comment thread — a real back-and-forth, not an abstract feature
          bullet. */}
      <div className="flex flex-col gap-3 border-b border-ink-800 px-4 py-3">
        {DEMO_COMMENTS.map((comment) => (
          <div key={comment.author} className="flex items-start gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[11px] font-semibold text-ink-200">
              {comment.author[0]}
            </span>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-ink-400">{comment.author}</span>
              <p className="text-xs text-ink-200">{comment.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Approval checklist — same idea as ApprovalGateChecklist.tsx: some
          gates satisfied, one still open. */}
      <div className="px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
          Engineering Review
        </span>
        <div className="mt-2 flex flex-col gap-1.5">
          {DEMO_GATES.map((gate) => (
            <div key={gate.label} className="flex items-center gap-2 text-xs">
              {gate.done ? (
                <CheckCircle size={16} weight="fill" className="shrink-0 text-accent-fg-400" />
              ) : (
                <Circle size={16} weight="bold" className="shrink-0 text-ink-600" />
              )}
              <span className={gate.done ? "text-ink-300" : "text-ink-500"}>{gate.label}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded-lg bg-accent-500 py-2 text-xs font-semibold text-chrome-950 transition hover:bg-accent-400"
        >
          Approve Revision
        </button>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const workflowRef = useScrollReveal<HTMLDivElement>();
  const servicesRef = useScrollReveal<HTMLDivElement>();
  const audiencesRef = useScrollReveal<HTMLDivElement>();

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

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <main>

        {/* Hero: eyebrow pill, headline, workflow indicator, dual CTAs, HUD demo panel */}
        <section className="mx-auto max-w-7xl px-6 pb-16 pt-16 md:pt-20 bg-ink-950">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-300">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                3D_Design_Review &middot; Team_Workflow
              </span>
              <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink-50 md:text-5xl">
                Review 3D model changes before they become <span className="text-accent-fg-400">expensive mistakes</span>.
              </h1>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink-400">
                Compare revisions, discuss changes directly on the model, and approve the
                version your team is ready to manufacture.
              </p>

              {/* Workflow indicator — the whole product story in one line. */}
              <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-ink-300">
                {["Compare", "Comment", "Review", "Approve"].map((step, i) => (
                  <span key={step} className="flex items-center gap-2">
                    <span className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1">{step}</span>
                    {i < 3 && <ArrowRight size={14} weight="bold" className="text-ink-600" />}
                  </span>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/login?mode=signup"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-chrome-950 transition hover:bg-accent-400 active:scale-[0.98]"
                >
                  Start a Free Review
                  <ArrowRight size={16} weight="bold" />
                </Link>
                <a
                  href="#workflow"
                  className="rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-medium text-ink-200 transition hover:border-ink-500 active:scale-[0.98]"
                >
                  See How It Works
                </a>
              </div>

              <p className="mt-5 flex items-center gap-1.5 text-xs text-ink-500">
                <ShieldCheck size={14} weight="fill" className="text-accent-fg-400" />
                No account &middot; No install &middot; Files never leave your machine
              </p>
            </div>

            {/* Static decorative panel — no click/link. Illustrates the real
                Projects History view (see ProjectDetailPage.tsx) plus a
                comment (see VersionDetailPage.tsx) with demo data; not
                wired to any account. */}
            <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                <span>Robot Housing &middot; History</span>
                <span>Updated</span>
              </div>

              {DEMO_HISTORY_ROWS.map((row, index) => {
                const isSynthetic = row.added === 0 && row.removed === 0;
                return (
                  <div
                    key={row.title}
                    className="flex items-stretch gap-3 border-b border-ink-800 px-4 py-3 text-sm last:border-b-0"
                  >
                    <div className="flex w-3 shrink-0 flex-col items-center">
                      <div className={`w-px flex-1 ${index === 0 ? "bg-transparent" : "bg-ink-800"}`} />
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${APPROVAL_DOT_COLOR[row.status]}`} />
                      <div className={`w-px flex-1 ${index === DEMO_HISTORY_ROWS.length - 1 ? "bg-transparent" : "bg-ink-800"}`} />
                    </div>

                    <div className="flex min-w-0 flex-1 items-center gap-4 py-0.5">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-sm font-semibold text-ink-50">{row.title}</span>
                        <span className="block truncate text-xs text-ink-500">{row.description}</span>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          {isSynthetic ? (
                            <span className="whitespace-nowrap font-mono text-xs text-ink-500">12 tris</span>
                          ) : (
                            <>
                              <div className="whitespace-nowrap font-mono text-xs">
                                <span className="text-accent-fg-400">+{row.added.toLocaleString()}</span>{" "}
                                <span className="text-red-400">-{row.removed.toLocaleString()}</span>
                              </div>
                              <div className="mt-1 flex h-1 w-16 overflow-hidden rounded-full bg-ink-800">
                                <div className="bg-accent-500" style={{ width: `${row.addedPercent}%` }} />
                                <div className="bg-red-500" style={{ width: `${row.removedPercent}%` }} />
                              </div>
                            </>
                          )}
                        </div>
                        {row.status !== "approved" && <ApprovalBadge status={row.status} />}
                        <span className="whitespace-nowrap text-xs text-ink-500">{row.time}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* A single concrete comment — "discuss it, then decide," not
                  an abstract feature bullet. Pinned on v13, the row above
                  that's Changes Requested. */}
              <div className="flex items-start gap-2.5 px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[11px] font-semibold text-ink-200">
                  {DEMO_COMMENT.author[0]}
                </span>
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-ink-400">{DEMO_COMMENT.author} &middot; on v13</span>
                  <p className="text-xs text-ink-200">{DEMO_COMMENT.body}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Second look at the same panel, large and centered — replaces
              the old static Live-Diff-tool screenshot. The interactive
              try-it-live experience still lives at /live (see the header's
              "Free Diff tool" link and the hero's primary CTA). */}
          <div className="mx-auto mt-12 max-w-2xl">
            <BracketAssemblyPanel />
          </div>

          <div className="mx-auto mt-8 grid max-w-lg grid-cols-4 gap-4 border-t border-ink-900 pt-8">
            {HERO_STATS.map((stat) => (
              <HeroStatItem key={stat.label} stat={stat} />
            ))}
          </div>
        </section>

        {/* Version confusion: the relatable pain point before the pitch. */}
        <section className="border-t border-ink-900 px-6 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50 md:text-3xl">
              Stop guessing which 3D file is the latest.
            </h2>
            <div className="mx-auto mt-8 max-w-md rounded-xl border border-ink-800 bg-ink-900 p-5 text-left font-mono text-sm text-ink-400 shadow-xl">
              {MESSY_FILENAMES.map((name, i) => (
                <div
                  key={name}
                  className={`flex items-center gap-2 py-1.5 ${i < MESSY_FILENAMES.length - 1 ? "border-b border-ink-800" : ""}`}
                >
                  <span className="text-ink-600">📄</span>
                  <span className={i === MESSY_FILENAMES.length - 1 ? "text-amber-fg-400" : ""}>{name}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-ink-300">
              <Warning size={18} weight="fill" className="text-amber-fg-400" />
              Sound familiar?
            </p>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-ink-400">
              Email, Slack, and filenames weren't designed for engineering change control.
              Meshdiff gives your team one place to compare revisions, discuss changes, and
              approve the version that gets manufactured.
            </p>
          </div>
        </section>

        {/* Team workflow: the four-step story, connected end to end. */}
        <section id="workflow" className="border-t border-ink-900 px-6 py-16">
          <div className="mx-auto max-w-5xl">
            <SectionHeader tag="The Workflow" title="A review workflow your engineering team can actually use." />
            <div ref={workflowRef} className="grid gap-4 md:grid-cols-4">
              {WORKFLOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} data-animate className="reveal relative rounded-xl border border-ink-800 bg-ink-900 p-5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-ink-600">{step.number}</span>
                      <Icon size={20} weight="light" className="text-ink-400" />
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-ink-50">{step.label}</h3>
                    <p className="mt-1.5 text-xs font-semibold text-ink-300">{step.question}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-400">{step.detail}</p>
                    {i < WORKFLOW_STEPS.length - 1 && (
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

        {/* Revision history: a real approval-state timeline, using the same
            ApprovalBadge component the actual Projects workspace renders —
            paired with the looping "how it works" sequence (see
            WorkflowAnimation), each with its own caption, opposite sides of
            the same row since both are illustrating the same revision
            moving through the workflow. */}
        <section className="border-t border-ink-900 px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              tag="Revision History"
              title="Every revision. Every comment. One approved version."
              description="Every revision has a history. Every comment stays connected to the geometry. Everyone knows which version was approved."
            />
            <div className="grid gap-10 sm:grid-cols-2">
              <div className="flex flex-col">
                <p className="mb-4 text-sm font-semibold text-ink-300">
                  Watch a revision move through the workflow.
                </p>
                <div className="flex-1">
                  <WorkflowAnimation />
                </div>
              </div>
              <div className="flex flex-col">
                <p className="mb-4 text-sm font-semibold text-ink-300">
                  Every decision stays on the record.
                </p>
                <div className="flex-1 overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
                  {REVISION_TIMELINE.map((row, index) => (
                    <div
                      key={row.version}
                      className="flex items-stretch gap-3 border-b border-ink-800 px-4 py-3 text-sm last:border-b-0"
                    >
                      <div className="flex w-3 shrink-0 flex-col items-center">
                        <div className={`w-px flex-1 ${index === 0 ? "bg-transparent" : "bg-ink-800"}`} />
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${APPROVAL_DOT_COLOR[row.status]}`} />
                        <div className={`w-px flex-1 ${index === REVISION_TIMELINE.length - 1 ? "bg-transparent" : "bg-ink-800"}`} />
                      </div>
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-0.5">
                        <div className="min-w-0">
                          <span className="font-mono text-sm font-semibold text-ink-50">{row.version}</span>
                          <span className="block truncate text-xs text-ink-500">{row.description}</span>
                        </div>
                        <div className="shrink-0 text-right">
                          {row.commentCount ? (
                            <span className="flex items-center gap-1 rounded-sm border border-ink-700 bg-ink-950 px-2 py-0.5 text-[11px] font-medium text-ink-300">
                              <ChatCircle size={12} weight="fill" />
                              {row.commentCount} comments
                            </span>
                          ) : (
                            <ApprovalBadge status={row.status} />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* External review: no CAD software required — the bridge between
            internal engineering and outside customers/suppliers. */}
        <section className="border-t border-ink-900 px-6 py-16">
          <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50 md:text-3xl">
                Send a 3D review without sending a CAD file.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-400">
                Give customers, suppliers, and teammates a browser link. They can see exactly
                what changed and leave feedback without installing CAD software.
              </p>
              <Link
                to="/live"
                className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-chrome-950 transition hover:bg-accent-400 active:scale-[0.98]"
              >
                <PaperPlaneTilt size={16} weight="bold" />
                Share a Review
              </Link>
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

        {/* Audiences: built for teams that make physical things. */}
        <section className="border-t border-ink-900 px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <SectionHeader tag="Who It's For" title="Built for teams that make physical things." />
            <div ref={audiencesRef} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {AUDIENCES.map((audience) => {
                const Icon = audience.icon;
                return (
                  <div
                    key={audience.title}
                    data-animate
                    className="reveal rounded-xl border border-ink-800 bg-ink-900 p-6 transition hover:-translate-y-0.5 hover:border-ink-700"
                  >
                    <Icon size={28} weight="light" className="text-ink-400" />
                    <h3 className="mt-4 text-base font-semibold text-ink-50">{audience.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-400">{audience.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Technical capabilities: the diff engine that powers the review
            workflow above — real, but no longer the top of the page. */}
        <section id="features" className="border-t border-ink-900 px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              tag="Under The Hood"
              title="Powerful 3D comparison under the hood"
              description="The workflow above runs on a real comparison engine, not a mockup — here's what's actually happening under it."
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

        {/* Privacy: a short version of the same fact-checked claims used on
            /pricing (PricingPage.tsx's "A note on privacy" section) — same
            facts, condensed for a skim. The full version, with the caching
            fallback detail, stays on /pricing for anyone who wants it. */}
        <section className="border-t border-ink-900 px-6 py-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink-50">
              <ShieldCheck size={24} weight="fill" className="text-accent-fg-400" />
              Your 3D models are your IP.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-400">
              Meshdiff computes diffs in your browser — comparing two models never requires
              uploading them. On Pro and Team, projects are stored so your history and
              comments persist, but your files are never sent to a third party.
            </p>
          </div>
        </section>

        {/* Pricing (hidden until Stripe billing is wired up) — card grid is
            shared with the standalone /pricing page, see PricingCards.tsx */}
        {SHOW_MONETIZATION && (
          <section id="pricing" className="border-t border-ink-900 px-6 py-14">
            <div className="mx-auto max-w-5xl">
              <SectionHeader
                tag="Pricing"
                title="Diff for free. Upgrade to review, approve, and ship with your team."
                description="The comparison tool is free forever. Founding members get 50% off Pro and Team for 3 months."
              />
              <PricingCards />
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

        {/* Final CTA — the same real diff render used on the audiences
            section, as a dimmed backdrop rather than a generic gradient. */}
        <section
          className="relative overflow-hidden border-t border-ink-900 bg-cover bg-center px-6 py-24"
          style={{ backgroundImage: `url(${revisionCtaImg})` }}
        >
          <div aria-hidden="true" className="absolute inset-0 bg-ink-950/85" />
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink-50 md:text-4xl">
              Your next revision is coming.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-400">
              Make sure everyone knows what changed — and which version is approved.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/login?mode=signup"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-chrome-950 transition hover:bg-accent-400 active:scale-[0.98]"
              >
                Start Your First Free Review
                <ArrowRight size={16} weight="bold" />
              </Link>
              <Link
                to="/live"
                className="rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-medium text-ink-200 transition hover:border-ink-500 active:scale-[0.98]"
              >
                Compare Two Models
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="px-6 py-16">
          <SectionHeader tag="Questions" title="Frequently asked" />
          <div className="mt-8">
            <FaqAccordion />
          </div>
          <div className="mt-8 flex justify-center gap-3">
            <a
              href="/live"
              className="rounded-sm border border-ink-700 px-4 py-2 text-xs font-medium text-ink-300 hover:border-ink-500 hover:text-ink-50 transition-colors"
            >
              Try free tool
            </a>
            <button
              type="button"
              onClick={scrollToPricing}
              className="rounded-sm bg-accent-700 px-4 py-2 text-xs font-medium text-ink-50 hover:bg-accent-800 transition-colors"
            >
              View pricing
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
