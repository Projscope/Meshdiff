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
      <div className="flex w-full max-w-sm flex-col items-center rounded-lg border border-neutral-800 bg-neutral-900 px-8 py-10 text-center">
        <div className="upload-cube-scene">
          <div className="upload-cube">
            <div className="upload-cube-face upload-cube-face-front" />
            <div className="upload-cube-face upload-cube-face-back" />
            <div className="upload-cube-face upload-cube-face-right" />
            <div className="upload-cube-face upload-cube-face-left" />
            <div className="upload-cube-face upload-cube-face-top" />
            <div className="upload-cube-face upload-cube-face-bottom" />
          </div>
        </div>
        <p className="mt-9 max-w-full truncate text-sm font-semibold text-white">{title}</p>
        {subtitle && <p className="mt-1.5 text-xs text-neutral-500">{subtitle}</p>}
      </div>
    </div>
  );
}
