import { useClippingPlaneState, type ClippingAxis } from "../lib/clippingPlane";

const AXIS_LABEL: Record<ClippingAxis, string> = { x: "X", y: "Y", z: "Z" };

/**
 * Cross-section / clipping-plane toggle — cuts the model in half along a
 * chosen axis so internal geometry (bores, cavities, wall thickness) is
 * visible without switching to transparent shading. A single global
 * preference (see clippingPlane.ts) — rendering this in multiple viewers at
 * once is fine, they all read/write the same shared value and stay in sync
 * immediately, same as ShadingModeToggle/GridToggle.
 */
export default function ClippingPlaneControl() {
  const [state, setState] = useClippingPlaneState();

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setState({ enabled: !state.enabled })}
        title={state.enabled ? "Hide cross-section" : "Cross-section: cut the model open to see inside"}
        className={`flex h-7 w-7 items-center justify-center rounded text-sm ${
          state.enabled ? "bg-sky-500/20 text-sky-400" : "text-ink-300 hover:bg-ink-800 hover:text-ink-50"
        }`}
      >
        ✂
      </button>
      {state.enabled && (
        <>
          <div className="flex overflow-hidden rounded-sm border border-ink-700 text-[11px]">
            {(["x", "y", "z"] as ClippingAxis[]).map((axis) => (
              <button
                key={axis}
                type="button"
                onClick={() => setState({ axis })}
                title={`Cut along the ${AXIS_LABEL[axis]} axis`}
                className={`px-1.5 py-0.5 ${
                  state.axis === axis ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-50"
                }`}
              >
                {AXIS_LABEL[axis]}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.position}
            onChange={(event) => setState({ position: Number(event.target.value) })}
            title="Cut position"
            className="w-20 accent-sky-400"
          />
          <button
            type="button"
            onClick={() => setState({ flip: !state.flip })}
            title="Flip which side is cut away"
            className="rounded-sm border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400 hover:border-ink-500 hover:text-ink-50"
          >
            ⇄
          </button>
        </>
      )}
    </div>
  );
}
