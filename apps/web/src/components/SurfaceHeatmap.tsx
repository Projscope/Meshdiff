import { useMemo } from "react";
import * as THREE from "three";
import {
  buildGhostOverlayColors,
  computeSurfaceDeviation,
  REMOVED_COLOR,
} from "../engine/surfaceDeviation";

interface SurfaceHeatmapProps {
  /** The surface shown to the user, heat-colored by its deviation from base. */
  geometry: THREE.BufferGeometry;
  /** The version geometry is compared against. */
  baseGeometry: THREE.BufferGeometry;
  /** Deviations within this distance render as unchanged (gray) or invisible (ghost). */
  toleranceMm?: number;
}

/**
 * Renders a single unified surface (geometry) with per-vertex color showing
 * how far it deviates from baseGeometry: green = pushed outward (added
 * material), red = pulled inward (removed material), gray = unchanged.
 *
 * This only colors geometry's own surface, so a region entirely absent
 * from geometry but present in baseGeometry (fully removed material, e.g.
 * a hole cut through) has no surface here to color on its own — to make
 * that visible anyway, a translucent "ghost" of baseGeometry is layered on
 * top, rendered only where it sticks out beyond geometry past tolerance.
 */
export default function SurfaceHeatmap({ geometry, baseGeometry, toleranceMm }: SurfaceHeatmapProps) {
  const colored = useMemo(() => {
    const result = computeSurfaceDeviation(geometry, baseGeometry, { toleranceMm });
    if (!result.success) return null;

    // Never mutate the loaded geometry in place — clone before attaching
    // per-vertex diff colors.
    const clone = geometry.clone();
    clone.setAttribute("color", new THREE.BufferAttribute(result.data.colors, 3));
    return { geometry: clone, maxAbsDeviationMm: result.data.maxAbsDeviationMm };
  }, [geometry, baseGeometry, toleranceMm]);

  const ghost = useMemo(() => {
    const result = computeSurfaceDeviation(baseGeometry, geometry, { toleranceMm });
    if (!result.success) return null;

    const rgba = buildGhostOverlayColors(
      result.data.signedDistancesMm,
      toleranceMm ?? 0,
      REMOVED_COLOR,
    );
    const clone = baseGeometry.clone();
    clone.setAttribute("color", new THREE.BufferAttribute(rgba, 4));
    return clone;
  }, [geometry, baseGeometry, toleranceMm]);

  if (!colored) return null;

  return (
    <>
      <mesh geometry={colored.geometry}>
        <meshStandardMaterial vertexColors />
      </mesh>
      {ghost && (
        <mesh geometry={ghost}>
          <meshStandardMaterial
            vertexColors
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </>
  );
}
