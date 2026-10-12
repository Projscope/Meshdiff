import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  /** Sections default open; the sidebar can get long, so this stays
   * per-mount state (not persisted) — collapsing is for decluttering the
   * current view, not a saved preference. */
  defaultOpen?: boolean;
}

/** Header + toggle shared by every property-style sidebar section, so
 * Summary/Printability/3MF Properties/Geometric Delta/etc. all collapse the
 * same way. Pair with `PropertyList`/`PropertyRow` below for the boxed
 * key-value look those sections share. */
export default function CollapsibleSection({ title, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-400 hover:text-ink-300"
      >
        <span>{title}</span>
        <svg
          viewBox="0 0 12 12"
          fill="none"
          className={`h-3 w-3 shrink-0 text-ink-500 transition-transform ${open ? "" : "-rotate-90"}`}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="mt-1.5 space-y-2">{children}</div>}
    </div>
  );
}

/** The rounded/bordered box with divided rows — same container the 3MF
 * Properties panel uses. */
export function PropertyList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-ink-800 rounded-lg border border-ink-800 bg-ink-900">{children}</div>;
}

/** A single label/value row inside a PropertyList. */
export function PropertyRow({
  label,
  value,
  valueClassName = "text-ink-200",
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 text-xs overflow-hidden">
      <span className="text-ink-500">{label}</span>
      <span className={`wrap-break-word ${valueClassName}`}>{value}</span>
    </div>
  );
}
