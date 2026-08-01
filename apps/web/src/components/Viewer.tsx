import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";

interface ViewerProps {
  label: string;
}

export default function Viewer({ label }: ViewerProps) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
      <span className="absolute left-3 top-2 z-10 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <Canvas camera={{ position: [50, 50, 50], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />
        <Grid infiniteGrid cellColor="#333" sectionColor="#555" />
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
