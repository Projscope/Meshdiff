import { useEffect, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds } from "@react-three/drei";
import { loadMeshGeometry } from "../engine/loadMesh";

/**
 * A real (not decorative/fake) static render of the actual demo models —
 * no OrbitControls, no interactivity, just Bounds-fit framing. Used in the
 * hero section as an honest preview of what the tool below actually shows,
 * rather than a placeholder icon.
 */
export default function HeroModelPreview({ url, color }: { url: string; color: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => response.blob())
      .then((blob) => loadMeshGeometry(new File([blob], url.split("/").pop() ?? "model.stl")))
      .then((result) => {
        if (!cancelled && result.success) setGeometry(result.data);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <Canvas camera={{ position: [50, 50, 50], fov: 45 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 20, 10]} intensity={0.9} />
      {geometry && (
        <Bounds fit clip observe margin={1.3}>
          <mesh geometry={geometry}>
            <meshStandardMaterial color={color} />
          </mesh>
        </Bounds>
      )}
    </Canvas>
  );
}
