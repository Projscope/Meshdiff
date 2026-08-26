import { useShowGrid } from "../lib/showGrid";

/**
 * A single global preference (see showGrid.ts) — rendering this in
 * multiple viewers at once is fine, they all read/write the same shared
 * value and stay in sync immediately, same as ShadingModeToggle.
 */
export default function GridToggle() {
  const [show, setShow] = useShowGrid();

  return (
    <button
      type="button"
      onClick={() => setShow(!show)}
      title={show ? "Hide the ground grid" : "Show the ground grid"}
      className={`flex h-7 w-7 items-center justify-center rounded text-sm ${
        show ? "bg-sky-500/20 text-sky-400" : "text-ink-300 hover:bg-ink-800 hover:text-ink-50"
      }`}
    >
      ▦
    </button>
  );
}
