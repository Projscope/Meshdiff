import { Link } from "react-router-dom";
import WaitlistForm from "../components/WaitlistForm";
import FaqAccordion from "../components/FaqAccordion";
import { APP_VERSION } from "../lib/version";

function LogoMark() {
  return (
    <div aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
      <div className="h-3 w-3 rotate-45 rounded-[2px] bg-white" />
    </div>
  );
}

const ROADMAP = {
  live: [
    "Voxel diff (STL/3MF/OBJ)",
    "Adjustable tolerance",
    "Volume delta metrics",
    "JSON diff report",
    "Shareable diff URLs",
    "Project workspaces",
    "Version history"
  ],
  beta: [
    "Surface-mode heatmap diff",
    "Removed-material ghost overlay",
    "Comment pins on models",
  ],
  next: [
    "Auto-align (PCA/ICP)",
    "Cross-section view",
    "Web-worker voxelizer",
    "Multi-file drag & drop",
    "Slicer profile snapshots",
    "Team approvals + PDF export",
  ],
};
const PLANNED_FEATURES = [
  "Version history — every save, restorable",
  "Comment pins anchored on 3D models",
  "Slicer profile snapshots per version",
  "Team approvals & report export",
];

export default function LandingPage() {
  function scrollToEarlyAccess() {
    document.getElementById("early-access")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-950/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoMark />
            <div className="flex items-center gap-1.5 leading-tight">
              <h1 className="text-sm font-semibold text-white">Meshdiff</h1>
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                v{APP_VERSION}
              </span>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-xs text-neutral-400 sm:flex">
            <a href="#pricing" className="hover:text-white">
              Pricing
            </a>
            <a href="#faq" className="hover:text-white">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-3 text-xs">
            <a href="/login" className="text-neutral-300 hover:text-white">
              Sign In
            </a>
          </div>
        </div>
      </header>

      <main>
      <section className="border-b border-neutral-800 px-6 py-10 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Community version runs 100% in your browser · files never leave your machine
        </span>
        <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold text-white sm:text-4xl">
          See exactly what changed between two 3D models.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-neutral-400">
          A diff of two binary STLs tells you nothing. Meshdiff runs a real
          voxel comparison on your STL, 3MF, and OBJ files —{" "}
          <span className="text-emerald-400">added geometry in green</span>,{" "}
          <span className="text-red-400">removed in red</span> — so you can
          review a revision in seconds.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3 text-xs">
          <button
            type="button"
            onClick={scrollToEarlyAccess}
            className="rounded bg-emerald-500 px-4 py-2 font-medium text-neutral-950 hover:bg-emerald-400"
          >
            Get early access →
          </button>
          <Link
            to="/live"
            className="rounded border border-neutral-700 px-4 py-2 font-medium text-neutral-200 hover:border-neutral-500"
          >
            Try the diff tool
          </Link>
        </div>

        <Link
          to="/live"
          className="mx-auto mt-10 block max-w-xl overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 text-left shadow-2xl transition hover:border-emerald-500/50"
        >
          <div className="flex h-48 items-center justify-center bg-neutral-950/50">
            <div className="flex flex-col items-center gap-2 text-neutral-500">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-emerald-400">
                ▶
              </div>
              <span className="text-xs">Open the free diff tool</span>
            </div>
          </div>
        </Link>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <span className="block text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-500">
          How it works
        </span>
        <h3 className="mt-2 text-center text-2xl font-semibold text-white">
          From two files to a shared review in seconds
        </h3>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/15 text-[10px] font-semibold text-emerald-400">01</div>
            <h4 className="mt-2 text-sm font-semibold text-white">Drop two models</h4>
            <p className="mt-1 text-xs text-neutral-400">
              Drag-and-drop a new version — STL, 3MF, or OBJ — and Meshdiff
              instantly formats both meshes for review. No mobile app,
              nothing to install: just pick a file.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/15 text-[10px] font-semibold text-emerald-400">02</div>
            <h4 className="mt-2 text-sm font-semibold text-white">Auto-align &amp; voxel diff</h4>
            <p className="mt-1 text-xs text-neutral-400">
              Meshdiff registers the meshes and voxelizes them — added
              geometry turns green, removed turns red. Tune the tolerance
              to taste.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/15 text-[10px] font-semibold text-emerald-400">03</div>
            <h4 className="mt-2 text-sm font-semibold text-white">Read &amp; share</h4>
            <p className="mt-1 text-xs text-neutral-400">
              See exact voxel counts and volume delta, then share a
              self-explaining link so anyone can spot the diff in their
              browser.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-14">
        <h3 className="text-center text-xs font-medium uppercase tracking-wide text-neutral-500">
          Built for print &amp; CAD engineers
        </h3>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h4 className="text-sm font-semibold text-white">100% local</h4>
            <p className="mt-1 text-xs text-neutral-400">
              Files never leave the browser unless you explicitly create a
              share link.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h4 className="text-sm font-semibold text-white">Deterministic</h4>
            <p className="mt-1 text-xs text-neutral-400">
              Same inputs produce the same diff every run.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h4 className="text-sm font-semibold text-white">Tolerance-aware</h4>
            <p className="mt-1 text-xs text-neutral-400">
              Adjust from 0–5mm to control diff sensitivity.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h4 className="text-sm font-semibold text-white">Format-native</h4>
            <p className="mt-1 text-xs text-neutral-400">
              STL, 3MF, and OBJ parsed directly, no conversion step.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h4 className="text-sm font-semibold text-white">Two diff modes</h4>
            <p className="mt-1 text-xs text-neutral-400">
              Voxel cube diff, or a surface heatmap of dimensional deviation.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h4 className="text-sm font-semibold text-white">Shareable</h4>
            <p className="mt-1 text-xs text-neutral-400">
              Send a link, not a file — anyone who opens it sees the exact
              same diff.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-800 px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <span className="block text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-500">
            Shareable comparisons
          </span>
          <h3 className="mt-2 text-center text-2xl font-semibold text-white">
            One link — no accounts, no downloads
          </h3>
          <div className="mt-8 grid gap-6 rounded-lg border border-neutral-800 bg-neutral-900 p-6 md:grid-cols-2">
            <div>
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                Shareable links
              </span>
              <h4 className="mt-3 text-lg font-semibold text-white">
                Send a diff, not a 40MB attachment
              </h4>
              <p className="mt-2 text-sm text-neutral-400">
                Hit Share in the viewer toolbar and Meshdiff generates a link
                to the exact comparison — same alignment, tolerance, and
                view. Recipients open it in any browser, no account or
                software needed.
              </p>
              <ul className="mt-4 flex flex-col gap-1.5 text-xs text-neutral-400">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Pick an expiry: 1, 3, or 7 days
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Link dies automatically — nothing left lingering
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Free on the Community plan
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <button
                type="button"
                className="w-full rounded bg-emerald-500 py-2 text-sm font-medium text-neutral-950"
              >
                Share this comparison
              </button>
              <p className="mt-3 text-[10px] uppercase tracking-wide text-neutral-500">
                Link expires in
              </p>
              <div className="mt-1.5 flex gap-1.5 text-xs">
                <span className="rounded border border-neutral-700 px-2 py-1 text-neutral-400">1 day</span>
                <span className="rounded border border-emerald-500 bg-emerald-500/10 px-2 py-1 text-emerald-400">
                  3 days
                </span>
                <span className="rounded border border-neutral-700 px-2 py-1 text-neutral-400">7 days</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 truncate rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[11px] text-neutral-400">
                  meshdiff.app/d/8f4a5c2
                </div>
                <button type="button" className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200">
                  Copy
                </button>
              </div>
              <p className="mt-3 text-[10px] text-neutral-600">
                Anyone with this link can view — expires in 3 days.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-800 px-6 py-14">
        <div className="mx-auto max-w-2xl rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500">
            Meshdiff, reviewed by
          </p>
          <p className="mt-3 text-lg text-neutral-200">
            &ldquo;Version control for 3D models has always been awkward,
            since a diff of two binary STLs tells you nothing useful.
            Meshdiff is a free browser-based tool that does the job
            properly.&rdquo;
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-xs text-neutral-500">
              🖨
            </div>
            <span className="text-xs text-neutral-500">a hardware engineer</span>
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-neutral-800 px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <span className="block text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-500">
            Pricing
          </span>
          <h3 className="mt-2 text-center text-2xl font-semibold text-white">
            Diff for free. Upgrade to keep the history.
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-neutral-400">
            The comparison tool is free forever. Paid plans add workspaces,
            versions, and review — with 50% off for 3 months at launch.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
              <h4 className="text-sm font-semibold text-neutral-300">Community</h4>
              <div className="mt-2 text-3xl font-bold text-white">$0</div>
              <p className="mt-1 text-xs text-neutral-500">Compare any two models, right now.</p>
              <Link
                to="/live"
                className="mt-4 block w-full rounded bg-emerald-500 py-2 text-center text-sm font-medium text-neutral-950 hover:bg-emerald-400"
              >
                Open the diff tool
              </Link>
              <ul className="mt-4 flex flex-col gap-1.5 text-xs text-neutral-400">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Compare OBJ / STL / 3MF files
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Voxel diff — added / removed
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Adjustable tolerance & cross-section
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Shareable links — 1, 3, or 7 days
                </li>
              </ul>
            </div>

            <div className="relative rounded-lg border border-emerald-500 bg-neutral-900 p-6">
              <span className="absolute -top-3 left-6 rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-neutral-950">
                50% OFF · 3 MONTHS
              </span>
              <h4 className="text-sm font-semibold text-emerald-400">Pro</h4>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">$7.50</span>
                <span className="text-xs text-neutral-500 line-through">$15</span>
                <span className="text-xs text-neutral-500">/mo</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">Founding price — first 3 months, early access only.</p>
              <button
                type="button"
                onClick={scrollToEarlyAccess}
                disabled
                className="mt-4 w-full cursor-not-allowed rounded border border-emerald-500/40 bg-emerald-500/10 py-2 text-sm font-medium text-emerald-400"
              >
                Launching soon
              </button>
              <ul className="mt-4 flex flex-col gap-1.5 text-xs text-neutral-400">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Everything in Community
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Project workspaces
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Version history for every model
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Comment pins on 3D models
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> PDF diff reports for client review
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
              <span className="inline-block rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-semibold text-neutral-400">
                50% OFF · 3 MONTHS
              </span>
              <h4 className="mt-2 text-sm font-semibold text-neutral-300">Team</h4>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">$17.50</span>
                <span className="text-xs text-neutral-500 line-through">$35</span>
                <span className="text-xs text-neutral-500">/seat/mo</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">Founding price — first 3 months, early access only.</p>
              <button
                type="button"
                onClick={scrollToEarlyAccess}
                disabled
                className="mt-4 w-full cursor-not-allowed rounded border border-neutral-700 py-2 text-sm font-medium text-neutral-400"
              >
                Launching soon
              </button>
              <ul className="mt-4 flex flex-col gap-1.5 text-xs text-neutral-400">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Everything in Pro
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Team approvals workflow
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Slicer profile snapshots & print logs
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span> Centralized billing & roles
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="early-access" className="border-t border-neutral-800 px-6 py-16">
        <div className="mx-auto max-w-5xl rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-center">
          <p className="text-base font-semibold text-emerald-300">
            🔒 Diffing runs entirely client-side.
          </p>
          <p className="mt-1 text-xs text-emerald-300/70">
            Nothing you drop into the diff tool is uploaded unless you
            explicitly create a share link — that's the only action that
            sends your files anywhere.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-5xl rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center">
          <span className="inline-block rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-300">
            Always shipping
          </span>
          <h3 className="mx-auto mt-3 max-w-lg text-xl font-semibold text-white">
            Meshdiff gets sharper every week — with a clear roadmap ahead
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
            The diff engine is live today, and we ship improvements
            constantly. There's a clear roadmap ahead — built in the open,
            with early-access members helping decide what lands next.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-neutral-400">
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400">✓</span> Frequent releases
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400">✓</span> Roadmap shaped by users
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400">✓</span> Your feedback ships
            </span>
          </div>
          <button
            type="button"
            onClick={scrollToEarlyAccess}
            className="mt-4 text-xs font-medium text-emerald-400 hover:text-emerald-300"
          >
            See what's coming — join early access →
          </button>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-10 md:grid-cols-2">
          <div>
            <span className="inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-300">
              Roadmap
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-white">
              Save projects, track versions, and review with your team
            </h2>
            <p className="mt-2 text-sm text-neutral-400">
              None of the items below exist in the tool today — this is the
              roadmap, not a feature list. Sign up and we&apos;ll email you
              when any of it actually ships.
            </p>
            <ul className="mt-6 flex flex-col gap-2 text-sm text-neutral-300">
              {PLANNED_FEATURES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-400">○</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="relative overflow-hidden rounded-lg border border-neutral-800 bg-cover bg-center p-6"
            style={{ backgroundImage: "url(/notify-bg.jpg)" }}
          >
            <div className="absolute inset-0 bg-neutral-950/80" />
            <div className="relative">
              <p className="text-sm text-neutral-300">
                Get notified when we launch project workspaces, comment
                threads, and print traceability.
              </p>
              <div className="mt-4">
                <WaitlistForm />
              </div>
              <p className="mt-3 text-xs text-neutral-400">
                No spam. Unsubscribe anytime. We&apos;ll email you from{" "}
                <span className="text-neutral-300">support@projscope.com</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <h3 className="text-center text-xs uppercase tracking-wide text-neutral-500">
            Status
          </h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-2 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
              </div>
              <ul className="mt-2 flex flex-col gap-2 text-xs text-neutral-300">
                {ROADMAP.live.map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    {item}
                    {(item === "Shareable diff URLs" || item === "Project workspaces" || item === "Version history")  && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
                        New
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-2 text-xs font-medium text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> In beta
              </div>
              <ul className="mt-2 flex flex-col gap-2 text-xs text-neutral-300">
                {ROADMAP.beta.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-2 text-xs font-medium text-neutral-400">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" /> Coming next
              </div>
              <ul className="mt-2 flex flex-col gap-2 text-xs text-neutral-300">
                {ROADMAP.next.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-800 px-6 py-16 text-center">
        <h3 className="text-2xl font-semibold text-white">
          Diff your next revision in seconds
        </h3>
        <p className="mt-2 text-sm text-neutral-400">
          Free forever for solo use. Sign up for early access to save
          projects and review with your team when it launches.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3 text-xs">
          <Link
            to="/live"
            className="rounded border border-neutral-700 px-4 py-2 font-medium text-neutral-200 hover:border-neutral-500"
          >
            ▶ Try the demo
          </Link>
          <button
            type="button"
            onClick={scrollToEarlyAccess}
            className="flex items-center gap-1.5 rounded bg-emerald-500 px-4 py-2 font-medium text-neutral-950 hover:bg-emerald-400"
          >
            Get Early Access — 50% Off
          </button>
        </div>
      </section>

      <section id="faq" className="border-t border-neutral-800 px-6 py-16">
        <span className="block text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-500">
          FAQ
        </span>
        <h3 className="mt-2 text-center text-2xl font-semibold text-white">
          Frequently asked
        </h3>
        <div className="mt-8">
          <FaqAccordion />
        </div>
        <p className="mt-6 text-center text-xs text-neutral-500">
          Still curious?{" "}
          <button type="button" onClick={scrollToEarlyAccess} className="text-emerald-400 hover:text-emerald-300">
            Join early access
          </button>{" "}
          and ask us anything.
        </p>
      </section>
      </main>

      <footer className="border-t border-neutral-800 px-6 py-6 text-center text-xs text-neutral-600">
        <div className="mb-2">
          <a href="/privacy" className="hover:text-neutral-400">
            Privacy Policy
          </a>
        </div>
        <div>
          Meshdiff © 2026 — free diff tool · Developed by{" "}
          <a
            href="https://projscope.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-400"
          >
            Projscope
          </a>
        </div>
      </footer>
    </div>
  );
}
