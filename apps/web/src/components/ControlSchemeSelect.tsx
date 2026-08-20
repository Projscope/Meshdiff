import { CONTROL_SCHEME_LEGEND, useControlScheme } from "../lib/controlScheme";

/**
 * A single global preference (see controlScheme.ts) — rendering this in
 * multiple viewers at once (e.g. both sides of a comparison) is fine, they
 * all read/write the same shared value and stay in sync immediately.
 *
 * The row of labels next to the dropdown names every bindable action (Pan,
 * Orbit/Rotate, Zoom, Left Click, Right Click); hovering any one of them
 * shows its exact key/mouse combination for whichever scheme is currently
 * active, via CONTROL_SCHEME_LEGEND — so the shortcut reference updates
 * immediately when the scheme is switched, without needing its own copy.
 */
interface ControlSchemeSelectProps {
  /** Off for compact icon toolbars — the per-action key/mouse combos are
   * still reachable via the select's own tooltip, just not spelled out as
   * a row of badges next to it. */
  showLegend?: boolean;
}

export default function ControlSchemeSelect({ showLegend = true }: ControlSchemeSelectProps) {
  const [scheme, setScheme] = useControlScheme();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={scheme}
        onChange={(event) => setScheme(event.target.value === "cad" ? "cad" : "meshdiff")}
        title="Camera controls: which mouse scheme to use for orbit/pan/zoom"
        className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[11px] text-neutral-300 hover:border-neutral-500"
      >
        <option value="meshdiff">Controls: Meshdiff</option>
        <option value="cad">Controls: CAD (Fusion/AutoCAD)</option>
      </select>
      {showLegend ? (
        CONTROL_SCHEME_LEGEND[scheme].map(({ label, combo }) => (
          <span
            key={label}
            title={combo}
            className="cursor-default rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500 hover:border-neutral-600 hover:text-neutral-300"
          >
            {label}
          </span>
        ))
      ) : (
        <span
          title={CONTROL_SCHEME_LEGEND[scheme].map(({ label, combo }) => `${label}: ${combo}`).join("\n")}
          className="flex h-5 w-5 cursor-default items-center justify-center rounded-full border border-neutral-700 text-[10px] text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
        >
          ℹ
        </span>
      )}
    </div>
  );
}
