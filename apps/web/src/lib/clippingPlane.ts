import { useEffect, useState } from "react";
import * as THREE from "three";

export type ClippingAxis = "x" | "y" | "z";

export interface ClippingPlaneState {
  enabled: boolean;
  axis: ClippingAxis;
  /** 0..1 fraction of the way through the model's bounding box on `axis`. */
  position: number;
  /** Which half of the split is cut away. */
  flip: boolean;
}

const STORAGE_KEY = "meshdiff_clipping_plane";
// Same "localStorage + custom event" pattern as shadingMode.ts/showGrid.ts —
// a single global preference, kept in sync across every viewer on the page
// without needing localStorage's own cross-tab-only "storage" event.
const CHANGE_EVENT = "meshdiff:clipping-plane-change";

const DEFAULT_STATE: ClippingPlaneState = { enabled: false, axis: "z", position: 0.5, flip: false };

function readStored(): ClippingPlaneState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<ClippingPlaneState>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_STATE.enabled,
      axis: parsed.axis === "x" || parsed.axis === "y" || parsed.axis === "z" ? parsed.axis : DEFAULT_STATE.axis,
      position:
        typeof parsed.position === "number" ? Math.min(1, Math.max(0, parsed.position)) : DEFAULT_STATE.position,
      flip: typeof parsed.flip === "boolean" ? parsed.flip : DEFAULT_STATE.flip,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function setClippingPlaneState(patch: Partial<ClippingPlaneState>): void {
  const next = { ...readStored(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/**
 * The active cross-section preference, shared across every viewer (and
 * persisted across visits) — same pattern as useShadingMode()/useShowGrid().
 */
export function useClippingPlaneState(): [ClippingPlaneState, (patch: Partial<ClippingPlaneState>) => void] {
  const [state, setState] = useState<ClippingPlaneState>(() => readStored());

  useEffect(() => {
    const onChange = () => setState(readStored());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [state, setClippingPlaneState];
}

// Same -90°-about-X transform ModelScene.tsx applies to lay this app's Z-up
// model data flat on drei's Y-up grid. Material.clippingPlanes are evaluated
// in world space regardless of the mesh's own transform, so a plane built
// from the geometry's *local* bounding box has to be carried through that
// same rotation to land in the right place relative to what's on screen.
const GROUP_ROTATION = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

/**
 * Builds a world-space clipping plane slicing through `geometry`'s own
 * local bounding box along `state.axis`, `state.position` fraction of the
 * way from min to max. Computes the bounding box itself if it isn't
 * already cached — a colored-3MF display geometry swapped in after the
 * plain-STL load path already ran computeBoundingBox() may not have one
 * yet. Returns null whenever there's nothing to clip, so callers can pass
 * `clippingPlanes={plane ? [plane] : []}` directly without a separate
 * enabled check.
 */
export function computeClippingPlane(
  state: ClippingPlaneState,
  geometry: THREE.BufferGeometry | null,
): THREE.Plane | null {
  if (!state.enabled || !geometry) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return null;
  const min = box.min[state.axis];
  const max = box.max[state.axis];
  const coord = min + (max - min) * state.position;
  const sign = state.flip ? 1 : -1;
  const normal = new THREE.Vector3(
    state.axis === "x" ? sign : 0,
    state.axis === "y" ? sign : 0,
    state.axis === "z" ? sign : 0,
  );
  const point = new THREE.Vector3(
    state.axis === "x" ? coord : 0,
    state.axis === "y" ? coord : 0,
    state.axis === "z" ? coord : 0,
  );
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point).applyMatrix4(GROUP_ROTATION);
}
