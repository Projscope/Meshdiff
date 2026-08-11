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
 * label. The "3-point radius" and "hover-detected hole" counterparts to
 * MeasurementOverlay's 2-point distance tool. */
export default function RadiusOverlay({ manualPoints, hoverPoint, fit, isPreview }: RadiusOverlayProps) {
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

  const outline = sampleCircle(fit).map((v): [number, number, number] => [v.x, v.y, v.z]);
  const centerPosition: [number, number, number] = [fit.center.x, fit.center.y, fit.center.z];
  const color = isPreview ? "#7dd3fc" : "#38bdf8";

  return (
    <>
      {manualPoints.map((p, i) => (
        <RadiusPoint key={i} position={p} />
      ))}
      <mesh position={centerPosition}>
        <sphereGeometry args={[0.4, 10, 10]} />
        <meshBasicMaterial color={color} transparent opacity={isPreview ? 0.5 : 0.7} />
      </mesh>
      <Line points={outline} color={color} lineWidth={1.5} dashed={isPreview} dashSize={1} gapSize={0.6} transparent opacity={isPreview ? 0.6 : 1} />
      <Html position={centerPosition} center distanceFactor={40} occlude={false}>
        <div
          className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow ${
            isPreview
              ? "border-sky-300 bg-sky-500/60 text-neutral-950"
              : "border-sky-400 bg-sky-500 text-neutral-950"
          }`}
        >
          R {fit.radius.toFixed(2)} mm · ⌀ {(fit.radius * 2).toFixed(2)} mm
          {isPreview ? " (click to confirm)" : ""}
        </div>
      </Html>
    </>
  );
}
