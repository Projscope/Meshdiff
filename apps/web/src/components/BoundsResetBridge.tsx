import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { useBounds } from "@react-three/drei";

/**
 * Bridges an imperative resetView() call (from outside the R3F tree) to
 * drei's <Bounds> re-fit — refits the camera to the framed content,
 * canceling out any pan/rotate/zoom the user has done since load. Must be
 * rendered as a child of <Bounds>; when a <Bounds> conditionally swaps
 * between multiple instances (e.g. DiffView's voxel/surface modes), mount
 * one of these in each so resetRef always points at whichever is current.
 */
export default function BoundsResetBridge({ resetRef }: { resetRef: MutableRefObject<(() => void) | null> }) {
  const bounds = useBounds();
  useEffect(() => {
    resetRef.current = () => bounds.refresh().fit();
  }, [bounds, resetRef]);
  return null;
}
