import { useMemo } from "react";
import * as THREE from "three";

interface EdgeOverlayProps {
  geometry: THREE.BufferGeometry;
}

// Angle (degrees) above which two adjacent faces count as a real edge —
// keeps a smooth-shaded curved surface (many near-coplanar triangles) from
// getting a dash drawn along every triangle seam.
const EDGE_THRESHOLD_DEGREES = 15;

/**
 * Dashed wireframe overlay shown over a semi-transparent mesh (see
 * shadingMode.ts) — with faces see-through, edges are otherwise hard to
 * read against whatever's visible behind them; a dashed line (vs. solid)
 * reads as an overlay/annotation rather than actual geometry.
 */
export default function EdgeOverlay({ geometry }: EdgeOverlayProps) {
  // Dash/gap size scale with the model's own extent so they look
  // consistent whether the model is a 5mm bracket or a 500mm enclosure.
  const { dashSize, gapSize } = useMemo(() => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const diagonalMm = box ? box.getSize(new THREE.Vector3()).length() : 10;
    return { dashSize: diagonalMm / 60, gapSize: diagonalMm / 90 };
  }, [geometry]);

  return (
    <lineSegments
      // computeLineDistances() has to run after the geometry is attached —
      // LineDashedMaterial reads per-vertex distances it populates to
      // decide where each dash/gap falls, and a fresh EdgesGeometry has
      // none set.
      onUpdate={(self) => self.computeLineDistances()}
    >
      <edgesGeometry args={[geometry, EDGE_THRESHOLD_DEGREES]} />
      <lineDashedMaterial color="#e5e5e5" dashSize={dashSize} gapSize={gapSize} transparent opacity={0.7} />
    </lineSegments>
  );
}
