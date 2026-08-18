import { useControlScheme } from "../lib/controlScheme";

/**
 * A single global preference (see controlScheme.ts) — rendering this in
 * multiple viewers at once (e.g. both sides of a comparison) is fine, they
 * all read/write the same shared value and stay in sync immediately.
 */
export default function ControlSchemeSelect() {
  const [scheme, setScheme] = useControlScheme();
  return (
    <select
      value={scheme}
      onChange={(event) => setScheme(event.target.value === "cad" ? "cad" : "meshdiff")}
      title="Camera controls: which mouse scheme to use for orbit/pan/zoom"
      className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[11px] text-neutral-300 hover:border-neutral-500"
    >
      <option value="meshdiff">Controls: Meshdiff</option>
      <option value="cad">Controls: CAD (Fusion/AutoCAD)</option>
    </select>
  );
}
