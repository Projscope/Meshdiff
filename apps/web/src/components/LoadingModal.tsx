import LoadingCube from "./LoadingCube";

interface LoadingModalProps {
  title: string;
  subtitle?: string;
}

/**
 * Blocking overlay for any client-side mesh work that takes a visible
 * moment (upload+diff on ProjectDetailPage, loading both sides of a
 * comparison on CompareVersionsPage) — a themed animation (a spinning
 * wireframe cube, echoing the voxel/mesh subject matter) rather than a
 * generic spinner, since a tiny spinner buried in a button or corner gives
 * no real sense that something is actually happening.
 */
export default function LoadingModal({ title, subtitle }: LoadingModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-sm flex-col items-center rounded-lg border border-ink-800 bg-ink-900 px-8 py-10 text-center">
        <LoadingCube />
        <p className="mt-9 max-w-full truncate text-sm font-semibold text-ink-50">{title}</p>
        {subtitle && <p className="mt-1.5 text-xs text-ink-500">{subtitle}</p>}
      </div>
    </div>
  );
}
