import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import AxisLegend from "./AxisLegend";
import AxisLabels from "./AxisLabels";

interface ReadOnlyMeshViewerProps {
  /** Shown top-left. Pass the loaded version's label (e.g. "v1"); falls back to `fallbackLabel` when `geometry` is null. */
  label: string;
  fallbackLabel: string;
  geometry: THREE.BufferGeometry | null;
  color?: string;
}

export default function ReadOnlyMeshViewer({ label, fallbackLabel, geometry, color = "#4f8ff7" }: ReadOnlyMeshViewerProps) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
      <span className="absolute left-3 top-2 z-10 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {geometry ? label : fallbackLabel}
      </span>
      {!geometry && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-neutral-600">
          No model loaded
        </div>
      )}
      <Canvas camera={{ position: [50, 50, 50], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />
        <Grid infiniteGrid cellColor="#333" sectionColor="#555" />
        {/* The grid is drei's default Y-up floor; this app's model data is
            Z-up (see diffVoxels.ts's gravity vector), so the displayed
            content is rotated -90° around X to lay it flat on that floor.
            Purely a presentation transform — doesn't touch the geometry
            used for diffing/printability. */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <axesHelper args={[30]} />
          <AxisLabels />
          {geometry && (
            <Bounds fit clip observe margin={1.2}>
              <mesh geometry={geometry}>
                <meshStandardMaterial color={color} />
              </mesh>
            </Bounds>
          )}
        </group>
        <OrbitControls makeDefault enableZoom enablePan enableRotate />
      </Canvas>
      <AxisLegend />
    </div>
  );
}
