import { Html, Line } from "@react-three/drei";
import { sampleCircle, type CircleFit } from "../lib/circleFit";

interface RadiusOverlayProps {
  /** 0–2 manually-clicked points (before a 3rd point completes a manual fit,
   * or before a hover-detected loop gets committed instead). */
  manualPoints: Array<[number, number, number]>;
  /** Nearest vertex under the cursor — shown only when nothing else (a
   * manual point or a detected-loop preview) is already being displayed. */
  hoverPoint: [number, number, number] | null;
  /** The circle actually being shown — either a live preview of a
   * hover-detected hole/rim (not yet clicked) or a committed measurement
   * (from 3 manual points or a confirmed detected loop). */
  fit: CircleFit | null;
  /** The detected loop's own traced mesh vertices, in order — when present,
   * these are drawn instead of an abstract resampled circle, so the overlay
   * literally highlights the rim/hole edge that was detected on the mesh
   * rather than just floating a best-fit circle near it. Absent for the
   * manual 3-point path, which has no real loop backing it. */
  loopPoints: Array<[number, number, number]> | null;
  /** Dashed + dimmer while previewing, solid once committed. */
  isPreview: boolean;
}

function RadiusPoint({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.6, 12, 12]} />
      <meshBasicMaterial color="#38bdf8" />
    </mesh>
  );
}

function HoverPreviewPoint({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.9, 16, 16]} />
      <meshBasicMaterial color="#7dd3fc" transparent opacity={0.55} depthTest={false} />
    </mesh>
  );
}

/** Renders manually-clicked points while collecting them, and — once a
 * circle is available, whether a live hover preview of a detected hole or
 * a committed measurement — its outline, center, and radius/diameter
 * label. When `loopPoints` is present (a real detected rim/hole), the
 * outline traces those actual mesh vertices in a bright detection color,
 * so the highlight reads as "this edge was found on the mesh" rather than
 * an abstract circle floating nearby; the manual 3-point path (no loop
 * backing it) falls back to `sampleCircle`'s resampled outline. The
 * "3-point radius" and "hover-detected hole" counterparts to
 * MeasurementOverlay's 2-point distance tool. */
export default function RadiusOverlay({ manualPoints, hoverPoint, fit, loopPoints, isPreview }: RadiusOverlayProps) {
  if (!fit) {
    return (
      <>
        {manualPoints.map((p, i) => (
          <RadiusPoint key={i} position={p} />
        ))}
        {hoverPoint && <HoverPreviewPoint position={hoverPoint} />}
      </>
    );
  }

  const isDetected = loopPoints !== null;
  const outline = isDetected
    ? [...loopPoints, loopPoints[0]]
    : sampleCircle(fit).map((v): [number, number, number] => [v.x, v.y, v.z]);
  const centerPosition: [number, number, number] = [fit.center.x, fit.center.y, fit.center.z];
  // Detected loops get a distinct green "found it" color (echoes the
  // diff viewer's added/changed convention); the manual-fit path keeps the
  // original sky-blue treatment since it isn't a detection at all.
  const color = isDetected ? (isPreview ? "#86efac" : "#22c55e") : isPreview ? "#7dd3fc" : "#38bdf8";
  const badgeClass = isDetected
    ? isPreview
      ? "border-accent-300 bg-accent-500/60 text-chrome-950"
      : "border-accent-400 bg-accent-500 text-chrome-950"
    : isPreview
      ? "border-sky-300 bg-sky-500/60 text-chrome-950"
      : "border-sky-400 bg-sky-500 text-chrome-950";

  return (
    <>
      {manualPoints.map((p, i) => (
        <RadiusPoint key={i} position={p} />
      ))}
      <mesh position={centerPosition}>
        <sphereGeometry args={[0.4, 10, 10]} />
        <meshBasicMaterial color={color} transparent opacity={isPreview ? 0.5 : 0.7} />
      </mesh>
      <Line
        points={outline}
        color={color}
        lineWidth={isDetected ? 2.5 : 1.5}
        dashed={isPreview && !isDetected}
        dashSize={1}
        gapSize={0.6}
        transparent
        opacity={isPreview ? 0.75 : 1}
      />
      <Html position={centerPosition} center distanceFactor={40} occlude={false}>
        <div className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow ${badgeClass}`}>
          {isDetected ? "Detected rim · " : ""}
          R {fit.radius.toFixed(2)} mm · ⌀ {(fit.radius * 2).toFixed(2)} mm
          {isPreview ? " (click to confirm)" : ""}
        </div>
      </Html>
    </>
  );
}
