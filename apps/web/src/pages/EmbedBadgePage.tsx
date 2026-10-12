import { useState } from "react";
import { useDocumentMeta } from "../lib/useDocumentMeta";

const DEFAULT_URL = "https://meshdiff.com";
const BADGE_SRC = "https://meshdiff.com/badge.svg";
const BADGE_ALT = "View 3D Model Diff on Meshdiff";

type SnippetFormat = "html" | "markdown";

function buildSnippet(format: SnippetFormat, targetUrl: string): string {
  return format === "html"
    ? `<a href="${targetUrl}" target="_blank" rel="noopener">\n  <img src="${BADGE_SRC}" alt="${BADGE_ALT}" />\n</a>`
    : `[![${BADGE_ALT}](${BADGE_SRC})](${targetUrl})`;
}

const USE_CASES = [
  {
    title: "3D Printing Repositories",
    items: "Printables, MakerWorld, Thingiverse remix descriptions.",
  },
  {
    title: "Engineering Documentation",
    items: "Notion PRDs, GitBook specs, Confluence ECOs.",
  },
  {
    title: "Open Hardware & Portfolios",
    items: "GitHub READMEs, personal CAD portfolio updates.",
  },
];

/** Growth page for 3D printing creators/remixers — a copy-pasteable badge
 * to drop into a Printables/MakerWorld/Thingiverse listing or personal
 * site, linking back to Meshdiff. See the SEO & Launch Playbook's embed
 * badge pivot (targeting creators, not OSS maintainers). */
export default function EmbedBadgePage() {
  useDocumentMeta(
    "Add a Meshdiff Revision Badge to Your Model — Meshdiff",
    "Add an interactive 3D model diff link to your Printables, MakerWorld, or Thingiverse listing. Free embeddable badge, one snippet.",
  );
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<SnippetFormat>("html");
  const [shareUrlInput, setShareUrlInput] = useState("");

  const targetUrl = shareUrlInput.trim() || DEFAULT_URL;
  const snippet = buildSnippet(format, targetUrl);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (permissions, insecure context); the
      // snippet is still visible and selectable in the <pre> either way.
    }
  }

  return (
    <div className="bg-ink-950 text-ink-100">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">
          Add a Meshdiff interactive revision link to your 3D model description.
        </h1>
        <p className="mt-3 text-sm text-ink-400 sm:text-base">
          Sharing a remix or a hardware update? Drop this badge into your Printables, MakerWorld,
          Thingiverse, or personal site listing so people can inspect exactly what changed between
          versions — no extra work, just a link.
        </p>

        {/* Clickable preview — opens the real target URL, so a creator can
            confirm exactly what a viewer clicking the badge will see. */}
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex items-center gap-4 rounded-lg border border-ink-800 bg-ink-900 p-4 transition-colors hover:border-ink-600"
          title={`Opens ${targetUrl} in a new tab — try it`}
        >
          <img src="/badge.svg" alt={BADGE_ALT} width={172} height={24} />
          <span className="text-xs text-ink-500">← click to try it yourself</span>
        </a>

        {/* Optional share-link input — the snippet below points at this
            URL instead of the generic homepage once filled in, so the
            copied badge links straight to the creator's own comparison. */}
        <div className="mt-6">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Your Meshdiff share link (optional)
          </label>
          <input
            type="text"
            value={shareUrlInput}
            onChange={(event) => setShareUrlInput(event.target.value)}
            placeholder="https://meshdiff.com/live?share=your-id"
            className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-600 focus:border-accent-500 focus:outline-hidden"
          />
          <p className="mt-1.5 text-[11px] text-ink-500">
            Leave blank to link to meshdiff.com — paste your own share link so the badge points
            straight at your comparison instead.
          </p>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div className="flex overflow-hidden rounded-sm border border-ink-700 text-xs">
              <button
                type="button"
                onClick={() => setFormat("html")}
                className={`px-3 py-1.5 font-medium ${
                  format === "html" ? "bg-accent-500 text-chrome-950" : "text-ink-400 hover:bg-ink-800"
                }`}
              >
                HTML
              </button>
              <button
                type="button"
                onClick={() => setFormat("markdown")}
                className={`px-3 py-1.5 font-medium ${
                  format === "markdown" ? "bg-accent-500 text-chrome-950" : "text-ink-400 hover:bg-ink-800"
                }`}
              >
                Markdown
              </button>
            </div>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="rounded-sm bg-accent-500 px-3 py-1.5 text-xs font-medium text-chrome-950 hover:bg-accent-400"
            >
              {copied ? "Copied!" : "Copy snippet"}
            </button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-ink-800 bg-ink-950 p-4 text-xs text-ink-300">
            <code>{snippet}</code>
          </pre>
          <p className="mt-1.5 text-[11px] text-ink-500">
            {format === "html"
              ? "Works anywhere raw HTML is allowed — Printables, personal sites, Confluence."
              : "Works anywhere Markdown is rendered — GitHub READMEs, Notion, GitBook, MakerWorld."}
          </p>
        </div>

        <p className="mt-6 text-xs text-ink-500">
          No account or API key needed — just paste the snippet into your listing's description.
        </p>

        {/* "In the wild" — small mocked-up UI cards showing the badge in
            context, since showing beats telling for a visual embed. */}
        <div className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
            What it looks like in the wild
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Printables mock */}
            <div className="overflow-hidden rounded-lg border border-neutral-800 bg-white text-neutral-900">
              <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-100 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="ml-1 text-[9px] font-medium text-neutral-500">printables.com</span>
              </div>
              <div className="p-3">
                <p className="text-[11px] font-semibold">Articulated Fox Remix v3</p>
                <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                  Reinforced ankle joints, tighter tail tolerance…
                </p>
                <div className="mt-2 inline-flex items-center gap-1 rounded-sm border border-neutral-300 bg-neutral-950 px-1.5 py-0.5">
                  <span className="flex h-3 w-3 items-center justify-center rounded-xs bg-accent-500 text-[6px] font-bold text-chrome-950">
                    ^
                  </span>
                  <span className="text-[8px] font-semibold text-neutral-100">View Diff on Meshdiff</span>
                </div>
              </div>
            </div>

            {/* GitHub README mock */}
            <div className="overflow-hidden rounded-lg border border-neutral-800 bg-white text-neutral-900">
              <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-100 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="ml-1 text-[9px] font-medium text-neutral-500">README.md</span>
              </div>
              <div className="p-3">
                <p className="text-[11px] font-semibold"># Bracket Mount v2.1</p>
                <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                  Wall thickness increased to 2.4mm for FDM…
                </p>
                <div className="mt-2 inline-flex items-center gap-1 rounded-sm border border-neutral-300 bg-neutral-950 px-1.5 py-0.5">
                  <span className="flex h-3 w-3 items-center justify-center rounded-xs bg-accent-500 text-[6px] font-bold text-chrome-950">
                    ^
                  </span>
                  <span className="text-[8px] font-semibold text-neutral-100">View Diff on Meshdiff</span>
                </div>
              </div>
            </div>

            {/* Notion spec mock */}
            <div className="overflow-hidden rounded-lg border border-neutral-800 bg-white text-neutral-900">
              <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-100 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="ml-1 text-[9px] font-medium text-neutral-500">Notion — ECO-114</span>
              </div>
              <div className="p-3">
                <p className="text-[11px] font-semibold">Housing revision spec</p>
                <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                  Moved mounting bosses 3mm inboard…
                </p>
                <div className="mt-2 inline-flex items-center gap-1 rounded-sm border border-neutral-300 bg-neutral-950 px-1.5 py-0.5">
                  <span className="flex h-3 w-3 items-center justify-center rounded-xs bg-accent-500 text-[6px] font-bold text-chrome-950">
                    ^
                  </span>
                  <span className="text-[8px] font-semibold text-neutral-100">View Diff on Meshdiff</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Where creators use it */}
        <div className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
            Where creators use it
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {USE_CASES.map((useCase) => (
              <div key={useCase.title} className="rounded-lg border border-ink-800 bg-ink-900 p-4">
                <p className="text-sm font-semibold text-ink-50">{useCase.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{useCase.items}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
