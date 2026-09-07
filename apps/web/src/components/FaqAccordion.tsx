import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "Are my files uploaded to a server?",
    a: "In Community, files stay on your machine when comparing or measuring — they never leave your browser. Files are uploaded only when you create a share link. Pro and Team upload all files to storage (for saved projects, history, and versioning).",
  },
  {
    q: "Which file formats are supported?",
    a: "STL, 3MF, and OBJ, parsed natively in-browser with no conversion step.",
  },
  {
    q: "How does the voxel diff actually work?",
    a: "Both meshes are voxelized into a shared grid at your chosen tolerance, then each cell is classified as added, removed, or unchanged.",
  },
  {
    q: "What are shareable comparisons, and how long do they last?",
    a: "A share link uploads both files (direct to storage, not through our servers) and lets anyone with the link view the exact same diff. Links expire after 1, 3, or 7 days.",
  },
  {
    q: "Is there a free tier without a time limit?",
    a: "Yes — the Community diff tool is free forever for solo use. Pro and Team add saved projects, version history, and team review.",
  },
  {
    q: "What's the difference between Free, Pro, and Team?",
    a: (
      <>
        Free is the diff engine itself, permanently — no account, no time limit. Pro adds saved project workspaces,
        version history, and PDF reports. Team adds comment pins, an approvals workflow, and print-log tracking. See
        the full{" "}
        <Link to="/pricing" className="text-accent-fg-400 underline underline-offset-2 hover:text-accent-fg-300">
          feature comparison
        </Link>
        .
      </>
    ),
  },
  {
    q: "Where do I go for support?",
    a: "Email support@projscope.com and we'll get back to you.",
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-2">
      {FAQS.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.q} className="rounded-lg border border-ink-800 bg-ink-900">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-ink-200"
            >
              {item.q}
              <span
                className={`ml-4 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-ink-800 text-accent-fg-400 transition-transform ${
                  isOpen ? "rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>
            {isOpen && <p className="px-4 pb-3 text-sm text-ink-400">{item.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
