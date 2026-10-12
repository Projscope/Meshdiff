// Small on-screen key for the axesHelper's fixed color convention
// (X=red, Y=green, Z=blue), so it's clear which colored line is which axis
// without guessing — useful for spotting orientation issues (e.g. a model
// authored Y-up when the app assumes Z-up for printability analysis).
export default function AxisLegend() {
  return (
    <div className="pointer-events-none absolute bottom-2 right-2 z-10 flex items-center gap-2 rounded-sm bg-ink-900/80 px-2 py-1 text-[10px] font-semibold">
      <span className="text-red-400">X</span>
      <span className="text-green-400">Y</span>
      <span className="text-blue-400">Z (up)</span>
    </div>
  );
}
