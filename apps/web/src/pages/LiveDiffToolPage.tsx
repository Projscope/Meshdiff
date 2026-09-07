import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as THREE from "three";
import { Check } from "@phosphor-icons/react";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import Viewer, { type ViewerHandle } from "../components/Viewer";
import DiffView, { type DiffViewHandle, type DiffMode, type DiffAlignment } from "../components/DiffView";
import MeasureViewer, { type MeasureViewerHandle } from "../components/MeasureViewer";
import ShareModal, { type ExpiresInDays } from "../components/ShareModal";
import ShareErrorModal from "../components/ShareErrorModal";
import FeedbackModal from "../components/FeedbackModal";
import DetailedStatsPanel from "../components/DetailedStatsPanel";
import { WAITLIST_ENDPOINT, SHARE_CREATE_ENDPOINT, shareGetEndpoint } from "../lib/api";
import { useAuth } from "../lib/AuthProvider";
import { getSubscription } from "../lib/projectsApi";
import { downloadDiffReportPdf } from "../lib/diffReportPdf";
import { useDiffColors } from "../lib/diffPalette";
import { useDocumentMeta } from "../lib/useDocumentMeta";

import compareDiffImage from '../assets/compare.svg';
import measureImage from '../assets/measure.svg';

type LiveTool = "compare" | "measure";
const TOOLS: Array<{ id: LiveTool; icon: string; label: string; description: string; image: string; badge?: string }> = [
  {
    id: "compare",
    icon: "🔀",
    label: "Compare Diff",
    description: "Diff two versions side-by-side — see what was added, removed, or changed.",
    image: compareDiffImage,
    badge: "Most Used",
  },
  {
    id: "measure",
    icon: "📏",
    label: "View & Measure",
    description: "Inspect one model — properties, printability, and click-to-measure distances.",
    image: measureImage,
  },
];

type DiffStats = VoxelDiffStats & { toleranceMm: number };

const DEFAULT_H1 = "Compare 3D Models Online — Free STL, 3MF & OBJ Diff Tool";
const DEFAULT_CTA = "Drag & drop two versions to see exactly what changed.";
const DEFAULT_META_TITLE = "Meshdiff — Compare 3D Model Versions (STL, 3MF, OBJ Diff Tool)";
const DEFAULT_META_DESCRIPTION =
  "Free, browser-native tool to compare STL, 3MF, and OBJ files. Runs entirely locally — no uploads, no signup required.";

interface LiveDiffToolPageProps {
  /** Real <h1> for this route — distinct per SEO landing page. Falls back
   * to a generic headline for the plain /live route. */
  h1?: string;
  /** Sub-headline directly under the H1, describing the one action to take. */
  ctaText?: string;
  /** Browser tab title / <title>, ideally built around the route's
   * primary keyword — see useDocumentMeta. */
  metaTitle?: string;
  metaDescription?: string;
  /** Skips the tool-picker cards and opens straight into Compare mode —
   * used by keyword-specific compare landing pages, since their whole
   * pitch is "the tool", not a menu of tools to choose from. */
  autoOpenCompare?: boolean;
}

export default function LiveDiffToolPage({
  h1 = DEFAULT_H1,
  ctaText = DEFAULT_CTA,
  metaTitle = DEFAULT_META_TITLE,
  metaDescription = DEFAULT_META_DESCRIPTION,
  autoOpenCompare = false,
}: LiveDiffToolPageProps = {}) {
  useDocumentMeta(metaTitle, metaDescription);
  const diffColors = useDiffColors();
  const [activeTool, setActiveTool] = useState<LiveTool | null>(autoOpenCompare ? "compare" : null);
  const [hoveredTool, setHoveredTool] = useState<LiveTool | null>(null);
  const [isToolModalOpen, setIsToolModalOpen] = useState(autoOpenCompare);

  const measureViewerRef = useRef<MeasureViewerHandle>(null);
  const [geometryA, setGeometryA] = useState<THREE.BufferGeometry | null>(null);
  const [geometryB, setGeometryB] = useState<THREE.BufferGeometry | null>(null);
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [mode, setMode] = useState<DiffMode>("voxel");
  const [toleranceMm, setToleranceMm] = useState(0.15);
  const [alignment, setAlignment] = useState<DiffAlignment>("none");
  const [stats, setStats] = useState<DiffStats | null>(null);
  const viewerARef = useRef<ViewerHandle>(null);
  const viewerBRef = useRef<ViewerHandle>(null);
  const diffViewRef = useRef<DiffViewHandle>(null);
  const { user } = useAuth();
  const [isProOrTeam, setIsProOrTeam] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isShareSubmitting, setIsShareSubmitting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoringShare, setIsRestoringShare] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);
  const [syncedCameraState, setSyncedCameraState] = useState<{ position: [number, number, number]; target: [number, number, number] } | null>(null);
  // Camera-lock toggle was removed from the toolbar — views always sync now.
  const isSyncEnabled = true;
  const [selectedDemo, setSelectedDemo] = useState<"simple" | "bracket" | "gear">("simple");
  const [sameFileWarning, setSameFileWarning] = useState<string | null>(null);
  const [showDetailedStats, setShowDetailedStats] = useState(false);
  const [boundingBoxB, setBoundingBoxB] = useState<[number, number, number]>([0, 0, 0]);

  // Community Newsletter States
  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscribeSuccess, setSubscribeSuccess] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setIsProOrTeam(false);
      return;
    }
    // accountStatus (not a raw tier === 'pro' check) mirrors the backend's
    // getAccountAccess() — true for Pro, a Team subscription's owner, and a
    // team member riding the owner's seats (whose own tier is 'free').
    getSubscription().then((result) => {
      setIsProOrTeam(result.success && result.data.accountStatus === "pro");
    });
  }, [user]);

  useEffect(() => {
    if (fileA && fileB && fileA.name === fileB.name && fileA.size === fileB.size) {
      setSameFileWarning(`File ${fileA.name} is being compared to itself.`);
    } else {
      setSameFileWarning(null);
    }
  }, [fileA, fileB]);

  const handleCameraChange = (state: { position: [number, number, number]; target: [number, number, number] }) => {
    setSyncedCameraState(state);
  };

  const handleSubscribeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscribeEmail.trim()) return;

    setIsSubscribing(true);
    setSubscribeError(null);

    try {
      const response = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subscribeEmail, source: "community_section" }),
      });
      const data = (await response.json()) as { success: boolean; error?: string };
      if (data.success) {
        setSubscribeSuccess(true);
        setSubscribeEmail("");
      } else {
        setSubscribeError(data.error ?? "Failed to subscribe. Please try again.");
      }
    } catch {
      setSubscribeError("Couldn't reach the server. Please try again in a moment.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const demoConfigs = {
    simple: { a: "/demo/version-a.stl", b: "/demo/version-b.stl", label: "Simple Bracket" },
    bracket: { a: "/demo/bracket-v1.stl", b: "/demo/bracket-v2.stl", label: "Complex Bracket" },
    gear: { a: "/demo/gear-v1.stl", b: "/demo/gear-v2.stl", label: "Gear Assembly" },
  };

  const currentDemo = demoConfigs[selectedDemo];

  useEffect(() => {
    const shareId = new URLSearchParams(window.location.search).get("share");
    if (!shareId) return;

    setIsSharedView(true);
    setIsRestoringShare(true);
    setActiveTool("compare");
    setIsToolModalOpen(true);

    fetch(shareGetEndpoint(shareId))
      .then(async (response) => {
        const data = (await response.json()) as {
          success: boolean;
          error?: string;
          data?: {
            mode: DiffMode;
            toleranceMm: number;
            fileA: { filename: string; downloadUrl: string };
            fileB: { filename: string; downloadUrl: string };
          };
        };
        if (!data.success || !data.data) {
          throw new Error(data.error ?? "This share link is no longer available");
        }
        const [blobA, blobB] = await Promise.all([
          fetch(data.data.fileA.downloadUrl).then((r) => r.blob()),
          fetch(data.data.fileB.downloadUrl).then((r) => r.blob()),
        ]);
        viewerARef.current?.loadFromBytes(blobA, data.data.fileA.filename);
        viewerBRef.current?.loadFromBytes(blobB, data.data.fileB.filename);
        setMode(data.data.mode);
        setToleranceMm(data.data.toleranceMm);
      })
      .catch((err: unknown) => {
        setRestoreError(err instanceof Error ? err.message : "Failed to load shared diff");
      })
      .finally(() => setIsRestoringShare(false));
  }, []);

  function handleCardClick(toolId: LiveTool) {
    setActiveTool(toolId);
    setIsToolModalOpen(true);
  }

  function dismissShareError() {
    setRestoreError(null);
    setIsSharedView(false);
    window.history.replaceState(null, "", window.location.pathname);
    viewerARef.current?.loadDemo();
    viewerBRef.current?.loadDemo();
  }

  async function handleShareSubmit(expiresInDays: ExpiresInDays) {
    if (!fileA || !fileB) return;
    setIsShareSubmitting(true);
    setShareError(null);

    try {
      const response = await fetch(SHARE_CREATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The server only accepts 'voxel'/'surface' (see share.ts's
          // validation, backed by migration 0011_shares.sql's check
          // constraint) — Overlay is a live-viewing mode, not yet a
          // shareable one, so it falls back to Voxels rather than the
          // request failing outright.
          mode: mode === "overlay" ? "voxel" : mode,
          toleranceMm,
          expiresInDays,
          fileA: { name: fileA.name, size: fileA.size },
          fileB: { name: fileB.name, size: fileB.size },
        }),
      });
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
        data?: { url: string; uploadUrlA: string; uploadUrlB: string };
      };
      if (!data.success || !data.data) {
        setShareError(data.error ?? "Something went wrong");
        return;
      }

      const uploads = await Promise.all([
        fetch(data.data.uploadUrlA, { method: "PUT", body: fileA }),
        fetch(data.data.uploadUrlB, { method: "PUT", body: fileB }),
      ]);
      if (uploads.some((r) => !r.ok)) {
        setShareError("Upload failed, please try again");
        return;
      }

      setShareUrl(data.data.url);
    } catch {
      setShareError("Couldn't reach the server — try again in a moment");
    } finally {
      setIsShareSubmitting(false);
    }
  }

  function handleDownloadReport() {
    if (!stats) return;
    downloadDiffReportPdf(stats, isProOrTeam, boundingBoxB, {
      viewA: viewerARef.current?.captureScreenshot(),
      viewB: viewerBRef.current?.captureScreenshot(),
      combined: diffViewRef.current?.captureScreenshot(),
    });
  }

  const activeHowItWorksMode = hoveredTool || "default";

  const howItWorksContent = {
    default: {
      title: "Select or hover over a tool card to explore its features",
      steps: [
        {
          num: "01",
          title: "Select a tool",
          desc: "Choose Compare Diff to inspect changes between two CAD versions or View & Measure to inspect individual models.",
        },
        {
          num: "02",
          title: "In-browser execution",
          desc: "All calculations and 3D rendering run 100% locally on your browser for instant performance and complete privacy.",
        },
        {
          num: "03",
          title: "Export & share",
          desc: "Download analysis reports, capture viewport screenshots, or create shareable review links for your team.",
        },
      ],
    },
    compare: {
      title: "From two files to a shared review in seconds",
      steps: [
        {
          num: "01",
          title: "Drop two models",
          desc: "Chose two models version — STL, 3MF, or OBJ — and Meshdiff instantly formats both meshes for review.",
        },
        {
          num: "02",
          title: "Auto-align & voxel diff",
          desc: "Meshdiff voxelizes both meshes — added geometry turns green, removed turns red. Tune the tolerance to taste.",
        },
        {
          num: "03",
          title: "Read & share",
          desc: "See exact voxel counts and volume delta, then share a self-explaining link so anyone can spot the diff.",
        },
      ],
    },
    measure: {
      title: "Load model, see its properties and measure it",
      steps: [
        {
          num: "01",
          title: "Load single model",
          desc: "Select any single 3D model file — STL, 3MF, or OBJ — for instant local rendering.",
        },
        {
          num: "02",
          title: "Inspect properties",
          desc: "View overall model dimensions, printability checks, surface bounding boxes, and topological stats.",
        },
        {
          num: "03",
          title: "Point-to-point measurement",
          desc: "Click anywhere on the geometry surface to measure exact distances and wall clearance.",
        },
      ],
    },
  }[activeHowItWorksMode];

  return (
    // min-h-screen (not h-screen + overflow-y-auto) — the old fixed-height
    // scroll box made this page scroll independently of the rest of the
    // site, so the footer (rendered by RootLayout right after this page)
    // sat immediately at that box's bottom edge with no visual gap,
    // reading as if it were floating over/cutting into this page's own
    // content instead of following it in normal document flow.
    <div className="flex min-h-screen flex-col bg-ink-950 text-ink-100 px-4 py-8 items-center">
      <div className="w-full max-w-3xl mx-auto pt-4 pb-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">{h1}</h1>
        <p className="mt-2 text-sm text-ink-400 sm:text-base">{ctaText}</p>
      </div>

      <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto py-6 gap-8">
        
        {/* Community Commitment & Subscription Banner */}
        <section className="w-full rounded-2xl border border-ink-800 bg-ink-900/50 p-6 text-center backdrop-blur-sm sm:p-8">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-[11px] font-semibold text-accent-fg-400">
              🤝 Built for the Community
            </span>
            <h2 className="text-xl font-bold tracking-tight text-ink-50 sm:text-2xl">
              Free, browser-native tools for 3D & CAD creators
            </h2>
            <p className="text-xs leading-relaxed text-ink-300 sm:text-sm">
              We strongly believe in supporting the community. Open, high-performance web applications make engineering and 3D printing workflows accessible to everyone. We are committed to building and contributing these tools for free, and we’ll keep actively expanding them.
            </p>

            {/* Newsletter Subscription */}
            <div className="mt-2 w-full max-w-md">
              {subscribeSuccess ? (
                <div className="rounded-lg border border-accent-500/40 bg-accent-500/10 p-3 text-xs font-medium text-accent-fg-300">
                  ✓ Thanks for subscribing! We&apos;ll keep you posted on new tools and updates.
                </div>
              ) : (
                <form onSubmit={handleSubscribeSubmit} className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    required
                    value={subscribeEmail}
                    onChange={(e) => setSubscribeEmail(e.target.value)}
                    placeholder="Enter your email for feature updates..."
                    className="flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-xs text-ink-50 placeholder-ink-500 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  />
                  <button
                    type="submit"
                    disabled={isSubscribing}
                    className="rounded-lg bg-accent-500 px-4 py-2 text-xs font-semibold text-chrome-950 transition-colors hover:bg-accent-400 disabled:opacity-50"
                  >
                    {isSubscribing ? "Subscribing..." : "Subscribe"}
                  </button>
                </form>
              )}
              {subscribeError && (
                <p className="mt-1 text-left text-[11px] text-red-400">{subscribeError}</p>
              )}
            </div>
          </div>
        </section>

        {/* Tool Cards Selection */}
        <div className="flex flex-wrap items-center justify-center gap-6 w-full py-16">
          {TOOLS.map((tool) => {
            const isActive = activeTool === tool.id && isToolModalOpen;

            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => handleCardClick(tool.id)}
                onMouseEnter={() => setHoveredTool(tool.id)}
                onMouseLeave={() => setHoveredTool(null)}
                aria-pressed={isActive}
                className={`group relative flex w-full max-w-sm flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-500/50 ${
                  isActive
                    ? "border-accent-500 bg-ink-900 shadow-lg shadow-accent-950/30 ring-1 ring-accent-500/50"
                    : "border-ink-800 bg-ink-900/60 hover:-translate-y-1 hover:border-ink-700 hover:bg-ink-900"
                }`}
              >
                {/* Active Indicator / Checkmark */}
                <div
                  className={`absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                    isActive
                      ? "border-accent-500 bg-accent-500 text-chrome-950"
                      : "border-ink-700 bg-ink-900/80 text-transparent group-hover:border-ink-500"
                  }`}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                {/* Image Preview Container */}
                <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-ink-800/80 bg-ink-950">
                  <img
                    src={tool.image}
                    alt={tool.label}
                    className={`h-full w-full object-cover transition-transform duration-300 ${
                      isActive ? "scale-105 opacity-100" : "opacity-70 group-hover:scale-105 group-hover:opacity-90"
                    }`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-900/90 via-transparent to-transparent" />
                </div>

                {/* Card Content */}
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none">{tool.icon}</span>
                    <h3
                      className={`text-sm font-semibold transition-colors ${
                        isActive ? "text-accent-fg-400" : "text-ink-50 group-hover:text-accent-fg-300"
                      }`}
                    >
                      {tool.label}
                    </h3>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-ink-400">
                    {tool.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* How It Works Section directly underneath choices */}
        <section className="w-full border-t border-ink-800/80 px-6 pt-6">
          <span className="block text-center text-[11px] font-semibold uppercase tracking-widest text-accent-fg-400">
            How it works
          </span>
          <h3 className="mt-1 text-center text-lg font-semibold text-ink-50 transition-all">
            {howItWorksContent.title}
          </h3>
          <div className="mx-auto mt-6 grid max-w-4xl gap-4 sm:grid-cols-3">
            {howItWorksContent.steps.map((step) => (
              <div key={step.num} className="rounded-lg border border-ink-800 bg-ink-900/60 p-4 transition-all">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-accent-500/15 text-[9px] font-semibold text-accent-fg-400">
                  {step.num}
                </div>
                <h4 className="mt-2 text-xs font-semibold text-ink-50">{step.title}</h4>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Pro Benefits CTA Section */}
        <section className="border-t border-ink-900 px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-lg border border-accent-500/20 bg-gradient-to-br from-accent-500/5 to-accent-500/0 p-8 md:p-12">
              <span className="inline-block rounded-full bg-accent-500/10 px-3 py-1 text-xs font-semibold text-accent-fg-400">
                PRO PLAN
              </span>
              <h2 className="mt-4 text-2xl font-bold text-ink-50 md:text-3xl">
                Everything you need for professional 3D model versioning
              </h2>
              <p className="mt-3 text-ink-400">
                Collaborate with your team, track changes, and make informed decisions with advanced diff tooling.
              </p>

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent-500/10">
                    <Check size={16} weight="bold" className="text-accent-fg-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink-50">Unlimited Projects</h3>
                    <p className="mt-1 text-sm text-ink-400">Save and organize as many 3D model projects as you need</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent-500/10">
                    <Check size={16} weight="bold" className="text-accent-fg-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink-50">Shareable Links</h3>
                    <p className="mt-1 text-sm text-ink-400">Create time-limited comparison links for stakeholders</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent-500/10">
                    <Check size={16} weight="bold" className="text-accent-fg-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink-50">Export Reports</h3>
                    <p className="mt-1 text-sm text-ink-400">Download analysis reports and screenshots as PNG/PDF</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent-500/10">
                    <Check size={16} weight="bold" className="text-accent-fg-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink-50">No Watermark</h3>
                    <p className="mt-1 text-sm text-ink-400">Share professional-looking comparisons without branding</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-center">
                <Link
                  to="/pricing"
                  className="rounded-lg bg-accent-500 px-6 py-3 text-center font-medium text-chrome-950 transition hover:bg-accent-400"
                >
                  View Pricing
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Tool Modal Overlay with 10px Margin on all sides */}
      {isToolModalOpen && activeTool && (
        <div className="fixed inset-[10px] z-50 flex flex-col rounded-2xl border border-ink-800 bg-ink-950 shadow-2xl overflow-hidden backdrop-blur-md">
          {/* Modal Header & Tool Switcher */}
          <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/90 px-4 py-3">
            <div className="flex items-center gap-1.5 rounded-xl border border-ink-800 bg-ink-950 p-1">
              {TOOLS.map((tool) => {
                const isSelected = activeTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setActiveTool(tool.id)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      isSelected
                        ? "bg-accent-500 text-chrome-950 shadow-sm"
                        : "text-ink-400 hover:text-ink-50"
                    }`}
                  >
                    <span>{tool.icon}</span>
                    <span>{tool.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setIsToolModalOpen(false)}
              className="rounded-lg border border-ink-800 bg-ink-900 p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-50 transition-colors"
              aria-label="Close modal"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Modal Tool Workspace Content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {isRestoringShare && (
              <div className="border-b border-ink-800 bg-ink-900 px-4 py-2 text-center text-xs text-ink-400">
                Loading shared diff…
              </div>
            )}
            {isSharedView && !isRestoringShare && !restoreError && (
              <div className="border-b border-ink-800 bg-ink-900 px-4 py-1.5 text-center text-[11px] text-ink-400">
                <b><i>Checking diffs is free. Want to have a workspaces, projects, versioning and approvals before shipping?{" "} </i></b>
                <a href="/#early-access" className="font-medium text-accent-fg-400 hover:text-accent-fg-300">
                  Try Meshdiff Pro
                </a>
              </div>
            )}

            {/* Action Toolbar */}
            <div className="flex items-center justify-between border-b border-ink-800 bg-ink-950 px-4 py-2 text-xs">
              <div className="flex items-center gap-3">
                {activeTool === "compare" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => viewerARef.current?.openFileDialog()}
                      className="rounded border border-ink-700 px-2 py-1 text-ink-300 hover:border-ink-500 hover:text-ink-50"
                    >
                      + Version A
                    </button>
                    <button
                      type="button"
                      onClick={() => viewerBRef.current?.openFileDialog()}
                      className="rounded border border-ink-700 px-2 py-1 text-ink-300 hover:border-ink-500 hover:text-ink-50"
                    >
                      + Version B
                    </button>
                    <select
                      value={selectedDemo}
                      onChange={(e) => setSelectedDemo(e.target.value as "simple" | "bracket" | "gear")}
                      className="rounded border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-300"
                    >
                      <option value="simple">Simple Bracket</option>
                      <option value="bracket">Complex Bracket</option>
                      <option value="gear">Gear Assembly</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        viewerARef.current?.loadDemo();
                        viewerBRef.current?.loadDemo();
                      }}
                      className="rounded border border-accent-500/40 bg-accent-500/10 px-2 py-1 text-accent-fg-300 hover:border-accent-400"
                    >
                      Load Demo
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => measureViewerRef.current?.openFileDialog()}
                    className="rounded border border-ink-700 px-2 py-1 text-ink-300 hover:border-ink-500 hover:text-ink-50"
                  >
                    + Load Model
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeTool === "compare" && (
                  <>
                    <button
                      type="button"
                      disabled={!fileA || !fileB}
                      onClick={() => {
                        setShareUrl(null);
                        setShareError(null);
                        setIsShareModalOpen(true);
                      }}
                      className="rounded border border-ink-700 px-3 py-1.5 text-ink-200 hover:border-ink-500 disabled:cursor-not-allowed disabled:text-ink-600"
                    >
                      Share This Diff
                    </button>
                    <button
                      type="button"
                      disabled={!stats}
                      onClick={handleDownloadReport}
                      className="rounded bg-accent-500 px-3 py-1.5 font-medium text-chrome-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-ink-800 disabled:text-ink-600"
                    >
                      Download Report
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setIsFeedbackModalOpen(true)}
                  className="relative rounded border border-accent-500/40 bg-accent-500/10 px-3 py-1.5 text-accent-fg-300 hover:border-accent-400"
                >
                  <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-accent-400" />
                  💬 Add Feedback
                </button>
              </div>
            </div>

            {/* Privacy Banner */}
            <div className="border-b border-accent-500/20 bg-accent-500/5 px-4 py-1.5 text-center text-[11px]">
              <span className="font-medium text-accent-fg-300">
                🔒 {activeTool === "compare" ? "Diffing" : "Viewing"} runs entirely client-side.
              </span>{" "}
              <span className="text-accent-fg-300/60">
                {activeTool === "compare"
                  ? "Nothing you drop here is uploaded unless you explicitly create a share link."
                  : "Nothing you drop here is ever uploaded."}
              </span>
            </div>

            {/* Viewports & Tool Body */}
            <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
              {activeTool === "measure" && (
                <div className="min-h-0 flex-1">
                  <MeasureViewer ref={measureViewerRef} demoUrl={currentDemo.a} />
                </div>
              )}
              {activeTool === "compare" && sameFileWarning && (
                <div className="rounded border border-amber-800 bg-amber-500/10 px-3 py-2 text-sm text-amber-fg-300">
                  ⚠ {sameFileWarning}
                </div>
              )}
              {activeTool === "compare" && (
                <>
                  <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
                    <Viewer
                      ref={viewerARef}
                      label="Version A"
                      onGeometryLoaded={(geometry, file) => {
                        setGeometryA(geometry);
                        setFileA(file);
                      }}
                      demoUrl={currentDemo.a}
                      syncedCameraState={isSyncEnabled ? syncedCameraState ?? undefined : undefined}
                      onCameraChange={handleCameraChange}
                      isSyncEnabled={isSyncEnabled}
                    />
                    <Viewer
                      ref={viewerBRef}
                      label="Version B"
                      onGeometryLoaded={(geometry, file) => {
                        setGeometryB(geometry);
                        setFileB(file);
                        geometry.computeBoundingBox();
                        const box = geometry.boundingBox;
                        if (box) {
                          const size = box.getSize(new THREE.Vector3());
                          setBoundingBoxB([size.x, size.y, size.z]);
                        }
                      }}
                      demoUrl={currentDemo.b}
                      syncedCameraState={isSyncEnabled ? syncedCameraState ?? undefined : undefined}
                      onCameraChange={handleCameraChange}
                      isSyncEnabled={isSyncEnabled}
                    />
                  </div>
                  <div className="min-h-0 flex-1">
                    <DiffView
                      ref={diffViewRef}
                      geometryA={geometryA}
                      geometryB={geometryB}
                      onStatsChange={setStats}
                      mode={mode}
                      onModeChange={setMode}
                      toleranceMm={toleranceMm}
                      onToleranceChange={setToleranceMm}
                      alignment={alignment}
                      onAlignmentChange={setAlignment}
                      syncedCameraState={isSyncEnabled ? syncedCameraState ?? undefined : undefined}
                      onCameraChange={handleCameraChange}
                      isSyncEnabled={isSyncEnabled}
                      holeChanges={stats?.holeChanges}
                    />
                  </div>

                  {stats ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded border border-ink-800 bg-ink-900 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-ink-500">
                            Added voxels
                          </div>
                          <div className={`mt-0.5 text-lg font-semibold ${diffColors.addedTextClass}`}>
                            +{stats.addedCount.toLocaleString()}
                          </div>
                        </div>
                        <div className="rounded border border-ink-800 bg-ink-900 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-ink-500">
                            Removed voxels
                          </div>
                          <div className={`mt-0.5 text-lg font-semibold ${diffColors.removedTextClass}`}>
                            -{stats.removedCount.toLocaleString()}
                          </div>
                        </div>
                        <div className="rounded border border-ink-800 bg-ink-900 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-ink-500">
                            Volume delta
                          </div>
                          <div className="mt-0.5 text-lg font-semibold text-ink-100">
                            {stats.approxVolumeDeltaPercent >= 0 ? "+" : ""}
                            {stats.approxVolumeDeltaPercent.toFixed(1)}%
                          </div>
                        </div>
                        <div className="rounded border border-ink-800 bg-ink-900 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-ink-500">
                            Tolerance
                          </div>
                          <div className="mt-0.5 text-lg font-semibold text-ink-100">
                            {stats.toleranceMm.toFixed(2)} mm
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDetailedStats(!showDetailedStats)}
                        className="rounded border border-ink-700 bg-ink-900 px-3 py-2 text-center text-xs text-ink-400 hover:border-ink-500 hover:text-ink-200"
                      >
                        {showDetailedStats ? "Hide" : "Show"} Detailed Stats
                      </button>
                    </>
                  ) : (
                    <div className="rounded border border-ink-800 bg-ink-900 px-3 py-2 text-center text-xs text-ink-500">
                      Load both versions to see diff stats
                    </div>
                  )}

                  {showDetailedStats && stats && (
                    <div className="rounded border border-ink-800 bg-ink-900 p-3">
                      <DetailedStatsPanel stats={stats} hasComparison boundingBoxB={boundingBoxB} />
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Auxiliary Modals */}
      {restoreError && (
        <ShareErrorModal message={restoreError} onDismiss={dismissShareError} />
      )}

      {isShareModalOpen && (
        <ShareModal
          onClose={() => {
            setIsShareModalOpen(false);
            setShareError(null);
          }}
          onSubmit={handleShareSubmit}
          isSubmitting={isShareSubmitting}
          error={shareError}
          shareUrl={shareUrl}
        />
      )}

      {isFeedbackModalOpen && <FeedbackModal onClose={() => setIsFeedbackModalOpen(false)} />}
    </div>
  );
}