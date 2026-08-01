import { useMemo } from "react";
import * as THREE from "three";
import { computeSurfaceDeviation } from "../engine/surfaceDeviation";

interface SurfaceHeatmapProps {
  /** The surface shown to the user, heat-colored by its deviation from base. */
  geometry: THREE.BufferGeometry;
  /** The version geometry is compared against. */
  baseGeometry: THREE.BufferGeometry;
}

/**
 * Renders a single unified surface (geometry) with per-vertex color showing
 * how far it deviates from baseGeometry: green = pushed outward (added
 * material), red = pulled inward (removed material), gray = unchanged.
 *
 * This only colors geometry's own surface, so a region entirely absent
 * from geometry but present in baseGeometry (fully removed material) has
 * no surface here to color — that case is covered by the voxel diff view
 * instead, which represents empty space directly.
 */
export default function SurfaceHeatmap({ geometry, baseGeometry }: SurfaceHeatmapProps) {
  const colored = useMemo(() => {
    const result = computeSurfaceDeviation(geometry, baseGeometry);
    if (!result.success) return null;

    // Never mutate the loaded geometry in place — clone before attaching
    // per-vertex diff colors.
    const clone = geometry.clone();
    clone.setAttribute("color", new THREE.BufferAttribute(result.data.colors, 3));
    return { geometry: clone, maxAbsDeviationMm: result.data.maxAbsDeviationMm };
  }, [geometry, baseGeometry]);

  if (!colored) return null;

  return (
    <mesh geometry={colored.geometry}>
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}
