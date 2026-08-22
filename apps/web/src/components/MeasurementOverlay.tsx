import * as THREE from "three";
import { Html, Line } from "@react-three/drei";

interface MeasurementOverlayProps {
  pointA: [number, number, number] | null;
  pointB: [number, number, number] | null;
  /** Nearest vertex under the cursor while in measure mode, before it's
   * clicked/committed — lets the user see exactly what they're about to
   * select. Not rendered once both points are already placed. */
  hoverPoint?: [number, number, number] | null;
}

function MeasurePoint({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.3, 12, 12]} />
      <meshBasicMaterial color="#facc15" />
    </mesh>
  );
}

function HoverPreviewPoint({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.45, 16, 16]} />
      <meshBasicMaterial color="#fde68a" transparent opacity={0.55} depthTest={false} />
    </mesh>
  );
}

/** A dimension-line arrowhead: a small cone whose tip sits exactly at
 * `point`, pointing away from the other endpoint — the standard
 * engineering-drawing convention (←───────→, arrows pointing outward at
 * each end) rather than a plain line, so a measurement reads as a proper
 * annotation rather than just two dots and a wire. */
function ArrowHead({ point, awayFrom, sizeMm }: { point: THREE.Vector3; awayFrom: THREE.Vector3; sizeMm: number }) {
  const direction = point.clone().sub(awayFrom).normalize();
  const height = sizeMm;
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  // THREE.ConeGeometry's apex sits at +height/2 along local +Y by default —
  // centering the cone half a height back from `point` along `direction`
  // puts the apex exactly on `point` once rotated into place.
  const position = point.clone().sub(direction.clone().multiplyScalar(height / 2));
  return (
    <mesh position={position} quaternion={quaternion}>
      <coneGeometry args={[height * 0.16, height, 12]} />
      <meshBasicMaterial color="#facc15" />
    </mesh>
  );
}

/** Renders the two snapped vertices, the line between them, and a
 * distance label at the midpoint — nothing here decides *which* vertex
 * gets snapped, that happens in VersionDetailPage's click handler. */
export default function MeasurementOverlay({ pointA, pointB, hoverPoint }: MeasurementOverlayProps) {
  if (!pointA) {
    return hoverPoint ? <HoverPreviewPoint position={hoverPoint} /> : null;
  }

  if (!pointB) {
    return (
      <>
        <MeasurePoint position={pointA} />
        {hoverPoint && <HoverPreviewPoint position={hoverPoint} />}
      </>
    );
  }

  const a = new THREE.Vector3(...pointA);
  const b = new THREE.Vector3(...pointB);
  const distance = a.distanceTo(b);
  const midpoint: [number, number, number] = [
    (pointA[0] + pointB[0]) / 2,
    (pointA[1] + pointB[1]) / 2,
    (pointA[2] + pointB[2]) / 2,
  ];
  // A fixed size, not scaled by the measured distance — same convention as
  // MeasurePoint/HoverPreviewPoint's dots above (0.6-0.9mm regardless of
  // context). Scaling by distance made a short measurement's arrow shrink
  // toward invisible while a long one grew oversized, the opposite of what
  // an annotation needs: legible regardless of what's being measured.
  const ARROW_SIZE_MM = 0.7;

  return (
    <>
      <MeasurePoint position={pointA} />
      <MeasurePoint position={pointB} />
      <Line points={[pointA, pointB]} color="#facc15" dashed dashSize={0.8} gapSize={0.5} lineWidth={1.5} />
      <ArrowHead point={a} awayFrom={b} sizeMm={ARROW_SIZE_MM} />
      <ArrowHead point={b} awayFrom={a} sizeMm={ARROW_SIZE_MM} />
      <Html position={midpoint} center distanceFactor={40} occlude={false}>
        <div className="whitespace-nowrap rounded-full border border-amber-400 bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-chrome-950 shadow">
          {distance.toFixed(2)} mm
        </div>
      </Html>
    </>
  );
}
