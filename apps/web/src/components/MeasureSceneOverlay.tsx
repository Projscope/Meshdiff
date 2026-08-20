import { Line } from "@react-three/drei";
import MeasurementOverlay from "./MeasurementOverlay";
import RadiusOverlay from "./RadiusOverlay";
import type { MeasureTool } from "../lib/useMeasureTool";

interface MeasureSceneOverlayProps {
  measure: MeasureTool;
}

/** The in-scene half of a measure tool — the two overlay types plus the
 * "close area" vertex/edge highlight shown while hovering. Goes inside
 * <ModelScene>; pair with MeasureToolbar for the on-screen controls. */
export default function MeasureSceneOverlay({ measure }: MeasureSceneOverlayProps) {
  return (
    <>
      {measure.measureMode === "distance" ? (
        <MeasurementOverlay pointA={measure.measureA} pointB={measure.measureB} hoverPoint={measure.measureHover} />
      ) : (
        <RadiusOverlay
          manualPoints={measure.radiusPoints}
          hoverPoint={measure.measureHover}
          fit={measure.radiusCommittedFit ?? measure.radiusPreviewFit}
          loopPoints={measure.radiusCommittedLoopPoints ?? measure.radiusPreviewLoopPoints}
          isPreview={!measure.radiusCommittedFit && measure.radiusPreviewFit !== null}
        />
      )}
      {measure.isMeasuring &&
        measure.nearbyVertices.map((vertex, index) => (
          <mesh key={`${vertex.join(",")}-${index}`} position={vertex}>
            <sphereGeometry args={[0.35, 8, 8]} />
            <meshBasicMaterial color="#facc15" transparent opacity={0.85} depthTest={false} />
          </mesh>
        ))}
      {measure.isMeasuring &&
        measure.nearbyEdges.map(([a, b], index) => (
          <Line
            key={`${a.join(",")}-${b.join(",")}-${index}`}
            points={[a, b]}
            color="#facc15"
            lineWidth={2.5}
            transparent
            opacity={0.85}
            depthTest={false}
          />
        ))}
    </>
  );
}
