import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { useBounds } from "@react-three/drei";

/**
 * Bridges an imperative zoomToFit() call (from outside the R3F tree) to
 * drei's Bounds.refresh().fit() — re-frames the camera tightly around the
 * current model while preserving whatever angle the user has rotated to.
 *
 * Deliberately the opposite tradeoff from BoundsResetBridge.tsx: that one
 * works around Bounds.fit() re-deriving camera position along the
 * *current* facing direction (see its own doc comment) because "Reset
 * View" should restore the exact original pose. Here that same behavior
 * is exactly what's wanted — "zoom to model" means "bring the model back
 * into frame from wherever I've panned/zoomed to", not "undo my rotation
 * too" — so this calls Bounds' own fit() directly instead of working
 * around it.
 *
 * Must render as a child of <Bounds>.
 */
export default function ZoomToFitBridge({ zoomRef }: { zoomRef: MutableRefObject<(() => void) | null> }) {
  const bounds = useBounds();

  useEffect(() => {
    zoomRef.current = () => {
      bounds.refresh().fit();
    };
  }, [bounds, zoomRef]);

  return null;
}
