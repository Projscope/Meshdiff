import { useState } from "react";

const FAQS = [
  {
    q: "Are my files uploaded to a server?",
    a: "No. The Community diff runs entirely in your browser — your STL, 3MF, and OBJ files never leave your machine unless you explicitly create a share link.",
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
    q: "Where do I go for support?",
    a: "Email support@projscope.com and we'll get back to you.",
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-2">
      {FAQS.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.q} className="rounded-lg border border-neutral-800 bg-neutral-900">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-200"
            >
              {item.q}
              <span
                className={`ml-4 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-neutral-800 text-emerald-400 transition-transform ${
                  isOpen ? "rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>
            {isOpen && <p className="px-4 pb-3 text-sm text-neutral-400">{item.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
