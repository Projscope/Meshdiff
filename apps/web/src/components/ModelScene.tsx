import type { ReactNode } from "react";
import { Grid } from "@react-three/drei";
import AxisLabels from "./AxisLabels";
import { useShowGrid } from "../lib/showGrid";

interface ModelSceneProps {
  /** Only MeasureViewer.tsx/VersionDetailPage.tsx need this — slicer-exported
   * files often place the model at its print-bed position rather than local
   * origin, so the grid is grounded under the model's actual footprint. */
  gridPosition?: [number, number, number];
  gridFadeDistance?: number;
  /** Same slicer-offset case as gridPosition — moves the axes/axesHelper to
   * sit at the model's own origin instead of world origin. */
  axisOrigin?: [number, number, number];
  children?: ReactNode;
}

/**
 * Lighting + ground grid + the Z-up-to-Y-up presentation rotation + axes,
 * shared by every mesh viewer (Viewer.tsx, DiffView.tsx,
 * ReadOnlyMeshViewer.tsx, MeasureViewer.tsx, VersionDetailPage.tsx) — this
 * was byte-identical across all of them. Rendered as a child of each
 * caller's own <Canvas> (camera/gl/onCreated genuinely differ per viewer,
 * so Canvas itself stays put in each file). `children` renders inside the
 * rotated group, alongside the axes, so mesh content lines up with them.
 */
export default function ModelScene({ gridPosition, gridFadeDistance, axisOrigin, children }: ModelSceneProps) {
  const [showGrid] = useShowGrid();
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />
      {showGrid && (
        <Grid infiniteGrid position={gridPosition} fadeDistance={gridFadeDistance} cellColor="#333" sectionColor="#555" />
      )}
      {/* The grid is drei's default Y-up floor; this app's model data is
          Z-up (see diffVoxels.ts's gravity vector), so the displayed
          content is rotated -90° around X to lay it flat on that floor.
          Purely a presentation transform — doesn't touch the geometry
          used for diffing/printability. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {axisOrigin ? (
          <group position={axisOrigin}>
            <axesHelper args={[30]} />
            <AxisLabels />
          </group>
        ) : (
          <>
            <axesHelper args={[30]} />
            <AxisLabels />
          </>
        )}
        {children}
      </group>
    </>
  );
}
