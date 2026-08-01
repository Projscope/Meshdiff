import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import type * as THREE from "three";
import { loadMeshGeometry } from "../engine/loadMesh";

interface ViewerProps {
  label: string;
  onGeometryLoaded?: (geometry: THREE.BufferGeometry) => void;
}

export default function Viewer({ label, onGeometryLoaded }: ViewerProps) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const result = await loadMeshGeometry(file);
    if (result.success) {
      setGeometry(result.data);
      setError(null);
      onGeometryLoaded?.(result.data);
    } else {
      setError(result.error);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-lg border bg-neutral-950 ${
        isDragOver ? "border-blue-500" : "border-neutral-800"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl,.obj,.3mf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />
      <span className="absolute left-3 top-2 z-10 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      {!geometry && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center text-sm text-neutral-500">
          {error ?? "Drop STL / OBJ here, or click to browse"}
        </div>
      )}
      <Canvas camera={{ position: [50, 50, 50], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />
        <Grid infiniteGrid cellColor="#333" sectionColor="#555" />
        {geometry && (
          <Bounds fit clip observe margin={1.2}>
            <mesh geometry={geometry}>
              <meshStandardMaterial color="#4f8ff7" />
            </mesh>
          </Bounds>
        )}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
