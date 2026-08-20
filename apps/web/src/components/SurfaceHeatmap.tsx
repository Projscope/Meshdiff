import { useEffect, useState } from "react";
import * as THREE from "three";
import { buildGhostOverlayColors } from "../engine/surfaceDeviation";
import { computeSurfaceDeviationOffThread } from "../lib/surfaceDeviationWorkerClient";
import { useDiffColors } from "../lib/diffPalette";

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
 *
 * The actual per-vertex BVH distance query runs off the main thread (see
 * surfaceDeviationWorkerClient.ts) — it used to run synchronously here,
 * which could visibly stall the viewer on a large mesh. The previously
 * computed geometry/ghost stay on screen while a new result is in flight,
 * rather than flashing to blank, and a stale response (e.g. the user
 * dragged the tolerance slider again before the first request finished) is
 * dropped instead of momentarily showing outdated colors.
 */
export default function SurfaceHeatmap({ geometry, baseGeometry, toleranceMm }: SurfaceHeatmapProps) {
  const [colored, setColored] = useState<{ geometry: THREE.BufferGeometry; maxAbsDeviationMm: number } | null>(null);
  const [ghost, setGhost] = useState<THREE.BufferGeometry | null>(null);
  const diffColors = useDiffColors();

  useEffect(() => {
    let cancelled = false;
    computeSurfaceDeviationOffThread(geometry, baseGeometry, {
      toleranceMm,
      addedColorHex: diffColors.addedHex,
      removedColorHex: diffColors.removedHex,
    }).then((result) => {
      if (cancelled || !result.success) return;
      // Never mutate the loaded geometry in place — clone before attaching
      // per-vertex diff colors.
      const clone = geometry.clone();
      clone.setAttribute("color", new THREE.BufferAttribute(result.data.colors, 3));
      setColored({ geometry: clone, maxAbsDeviationMm: result.data.maxAbsDeviationMm });
    });
    return () => {
      cancelled = true;
    };
  }, [geometry, baseGeometry, toleranceMm, diffColors]);

  useEffect(() => {
    let cancelled = false;
    computeSurfaceDeviationOffThread(baseGeometry, geometry, { toleranceMm }).then((result) => {
      if (cancelled || !result.success) return;
      const rgba = buildGhostOverlayColors(
        result.data.signedDistancesMm,
        toleranceMm ?? 0,
        new THREE.Color(diffColors.removedHex),
      );
      const clone = baseGeometry.clone();
      clone.setAttribute("color", new THREE.BufferAttribute(rgba, 4));
      setGhost(clone);
    });
    return () => {
      cancelled = true;
    };
  }, [geometry, baseGeometry, toleranceMm, diffColors]);

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
