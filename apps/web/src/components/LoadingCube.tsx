/**
 * The spinning wireframe cube animation itself (CSS in index.css), with no
 * backdrop/card — shared between LoadingModal.tsx (full-screen, page-level
 * loads) and any in-pane loading overlay (e.g. a single model viewer)
 * that wants the same themed animation without blocking the whole page.
 */
export default function LoadingCube() {
  return (
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
  );
}
