import { Link } from "react-router-dom";
import WaitlistForm from "../components/WaitlistForm";
import FaqAccordion from "../components/FaqAccordion";
import liveDiffPreview from "../assets/live-diff-preview.png";

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PersonBeardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M8.7 9.3c0 2.3 1.5 3.9 3.3 3.9s3.3-1.6 3.3-3.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

const PLANNED_FEATURES = [
  "Version history for every model",
  "Comment pins directly on 3D models",
  "Slicer profile snapshots",
  "Team approvals & PDF export",
];

export default function LandingPage() {
  function scrollToEarlyAccess() {
    document.getElementById("early-access")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main>
        <section className="border-neutral-800 px-6 pb-6 pt-10 text-center">
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
              Join the waitlist →
            </button>
            <Link
              to="/live"
              className="rounded border border-neutral-700 px-4 py-2 font-medium text-neutral-200 hover:border-neutral-500"
            >
              Try the diff tool
            </Link>
          </div>

          {/* <div className="mt-4">
            <CompactWaitlistForm />
            <p className="mt-1.5 text-[11px] text-neutral-600">
              Get notified when Pro &amp; Team launch — no spam.
            </p>
          </div> */}

          <div className="mt-12">
            <span className="block text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-500 ">
              <i>Community version</i> - forever free, no accounts, no uploads
            </span>

            <Link
              to="/live"
              aria-label="Open the free diff tool"
              className="group relative mx-auto mt-10 block max-w-3xl overflow-hidden rounded-lg border border-neutral-800 shadow-2xl transition hover:border-emerald-500/50"
            >
              <img
                src={liveDiffPreview}
                alt="Meshdiff Live Diff tool: side-by-side 3D viewers for Version A and Version B, with a voxel diff panel showing added and removed geometry"
                className="block w-full"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/0 opacity-0 transition group-hover:bg-neutral-950/50 group-hover:opacity-100">
                <span className="flex items-center gap-2 rounded-full bg-neutral-900/90 px-4 py-2 text-xs font-medium text-emerald-400 shadow-lg">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-500/50 text-[10px]">
                    ▶
                  </span>
                  Open the free diff tool
                </span>
              </div>

            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-10 pt-4">
          <span className="block text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-500">
            Built for makers, engineers &amp; teams
          </span>
          <h3 className="mx-auto mt-2 max-w-xl text-center text-lg font-semibold text-white">
            From a solo hobbyist checking a remix to a hardware team shipping
            parts — Meshdiff scales with you.
          </h3>

          <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-center">
              <div className="mx-auto flex items-center justify-center text-emerald-400">
                <PersonIcon />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-white">Hobbyists</h4>
              <p className="mt-1.5 text-xs text-neutral-400">
                Grabbed a remix off Thingiverse? Drop both STLs in and see
                exactly what the remixer changed before you commit filament.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-center">
              <div className="mx-auto flex items-center justify-center text-emerald-400">
                <PersonBeardIcon />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-white">CAD &amp; print engineers</h4>
              <p className="mt-1.5 text-xs text-neutral-400">
                Catch dimensional drift, thin walls, and unintended scaling
                between exports before a part fails on the bed.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-center">
              <div className="mx-auto flex items-center justify-center text-emerald-400">
                <PeopleIcon />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-white">Hardware teams</h4>
              <p className="mt-1.5 text-xs text-neutral-400">
                Review revisions together, approve changes, and keep a
                traceable history across every version anyone ships.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-neutral-500">
            Free for solo use.{" "}
            <a href="#pricing" className="font-medium text-emerald-400 hover:text-emerald-300">
              See Community vs. Pro &amp; Team pricing ↓
            </a>
          </p>
        </section>

        <section className="border-neutral-800 px-6 py-14">
          <div className="mx-auto max-w-5xl">
            <span className="block text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-500">
              Shareable comparisons
            </span>
            <h3 className="mt-2 text-center text-2xl font-semibold text-white">
              One link — no attachments, no downloads
            </h3>
            <div className="mt-8 grid gap-6 rounded-lg border border-neutral-800 bg-neutral-900 p-6 md:grid-cols-2">
              <div>
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                  Shareable links
                </span>
                <h4 className="mt-3 text-2xl font-bold text-white">
                  Send a diff, not a 40 MB attachment
                </h4>
                <p className="mt-2 text-sm text-neutral-400">
                  Hit <span className="font-semibold text-white">Share</span> in
                  the viewer toolbar and Meshdiff generates a link to the exact
                  comparison — same alignment, tolerance and view. Recipients
                  open it in any browser, no account or software needed.
                </p>
                <ul className="mt-4 flex flex-col gap-1.5 text-xs text-neutral-400">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400">→</span> Pick an expiry:{" "}
                    <span className="font-semibold text-neutral-200">1, 3 or 7 days</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400">→</span> Link dies automatically — nothing left lingering
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400">→</span> Free on the Community plan
                  </li>
                </ul>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 text-sm font-medium text-neutral-950"
                  >
                    🔗 Share
                  </button>
                  <span className="text-sm text-neutral-400">this comparison</span>
                </div>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-wide text-neutral-500">
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
                    meshdiff.app/d/8fa3c2
                  </div>
                  <button type="button" className="rounded bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-neutral-200">
                    Copy
                  </button>
                </div>
                <p className="mt-3 text-[10px] text-neutral-600">
                  Anyone with the link can view · expires in 3 days.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-neutral-800 px-6 py-14">
          <div className="mx-auto max-w-5xl">
            <span className="block text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-500 pb-4">
              Socials
            </span>
            <div className="mx-auto flex max-w-2xl gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
              <div className="w-1 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              <div>
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
                  <div className="flex h-10 w-40 items-center justify-left text-xs text-neutral-500">
                    <a rel="preconnect" target="_blank" href="https://blog.adafruit.com/2026/08/03/meshdiff-see-exactly-what-changed-between-two-3d-models">
                      <img src="https://blog.adafruit.com/app/themes/adafruit2013/images/logos/logo_2x.png" alt="Adafruit logo" className="h-10 w-20" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-neutral-800 px-6 py-14">
          <div className="mx-auto max-w-5xl">
            <span className="block text-center text-[11px] font-semibold uppercase tracking-widest text-emerald-500">
              Pricing
            </span>
            <h3 className="mt-2 text-center text-2xl font-semibold text-white">
              Diff for free. Upgrade to save, review, and share.
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-neutral-400">
              The comparison tool is free forever. Paid plans add workspaces,
              versions, and review — with 
              <span className="font-semibold text-rose-400"> 50% off for 3 months</span> at launch.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
                <h4 className="text-sm font-semibold text-neutral-300">Community</h4>
                <div className="mt-2 text-3xl font-bold text-white">FREE</div>
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
                <h4 className="text-sm font-semibold text-emerald-400">Pro</h4>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">$7.50</span>
                  <span className="text-xs text-neutral-500">/mo</span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-600">CAD & print engineers</p>
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
                <h4 className="mt-2 text-sm font-semibold text-neutral-300">Team</h4>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">$17.50</span>
                  <span className="text-xs text-neutral-500">/seat/mo</span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-600">Hardware teams</p>
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

        <section id="early-access" className="border-neutral-800 px-6 py-16">
          <div
            className="relative mx-auto max-w-5xl overflow-hidden rounded-xl border border-emerald-500/20 bg-neutral-950 p-10 text-center"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(16,185,129,0.16), transparent 70%)",
            }}
          >
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Always shipping
            </span>
            <h3 className="mx-auto mt-4 max-w-lg text-2xl font-bold text-white sm:text-3xl">
              Meshdiff gets sharper every week — with a clear roadmap ahead
            </h3>
            <p className="mx-auto mt-3 max-w-md text-sm text-neutral-400">
              The diff engine is live today, and we ship improvements
              constantly. There's a clear roadmap ahead — built in the open,
              with early-access members helping decide what lands next.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <span className="flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 text-xs text-neutral-300">
                <span className="text-emerald-400">✓</span> Frequent releases
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 text-xs text-neutral-300">
                <span className="text-emerald-400">✓</span> Roadmap shaped by users
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 text-xs text-neutral-300">
                <span className="text-emerald-400">✓</span> Your feedback ships
              </span>
            </div>
            <button
              type="button"
              onClick={scrollToEarlyAccess}
              className="mt-6 text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              See what's coming — join early access →
            </button>
          </div>

          <div className="mx-auto mt-10 grid max-w-5xl items-center gap-10 md:grid-cols-2">
            <div>
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                Founding members — 50% off for 3 months
              </span>
              <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
                Save projects, track versions, and review with your team.
              </h2>
              <ul className="mt-6 flex flex-col gap-3 text-sm text-neutral-300">
                {PLANNED_FEATURES.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-400">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-neutral-950 p-8 shadow-[0_0_60px_-15px_rgba(16,185,129,0.35)]">
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-[11px] text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Founding pricing closes at public launch
              </span>
              <p className="mt-5 text-sm font-semibold text-white">
                Claim your founding spot
              </p>
              <div className="mt-3">
                <WaitlistForm />
              </div>
              <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2.5 text-xs text-neutral-300">
                🎟 <span className="font-semibold text-rose-400">50% off for 3 months</span>{" "}
                for everyone who signs up before launch.
              </div>
              <p className="mt-4 text-center text-xs text-neutral-500">
                No spam. One launch email, then you decide.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="border-neutral-800 px-6 py-16">
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
    </div>
  );
}
