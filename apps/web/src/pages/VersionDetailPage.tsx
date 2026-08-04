import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import { getVersion, type VersionDetail } from "../lib/projectsApi";
import { loadMeshGeometry } from "../engine/loadMesh";
import PrintabilityBadge from "../components/PrintabilityBadge";

export default function VersionDetailPage() {
  const { projectId, versionId } = useParams<{ projectId: string; versionId: string }>();
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !versionId) return;
    let cancelled = false;

    getVersion(projectId, versionId).then(async (result) => {
      if (cancelled) return;
      if (!result.success) {
        setError(result.error);
        return;
      }
      setVersion(result.data);

      const response = await fetch(result.data.downloadUrl);
      const blob = await response.blob();
      const meshResult = await loadMeshGeometry(new File([blob], result.data.fileName));
      if (cancelled) return;
      if (meshResult.success) {
        setGeometry(meshResult.data);
      } else {
        setError(meshResult.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId]);

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-6xl gap-4 px-4 py-4">
      <div className="flex-1 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
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

      <div className="w-80 shrink-0 overflow-y-auto">
        <Link
          to={`/projects/${projectId}`}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          ← {version ? "Back to project" : "Back"}
        </Link>

        {error && (
          <div className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {version && (
          <>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-300">
                v{version.versionNumber}
              </span>
              <h1 className="truncate text-sm font-semibold text-white">{version.fileName}</h1>
            </div>

            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                AI Summary
              </h3>
              <p className="mt-1.5 text-sm text-neutral-300">
                {version.changeSummary ?? "No summary available."}
              </p>
            </div>

            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Version Stats
              </h3>
              <div className="mt-1.5 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Triangles</span>
                  <span className="text-neutral-200">{version.triangleCount ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">File Format</span>
                  <span className="text-neutral-200">{version.fileFormat.toUpperCase()}</span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Printability Gate
              </h3>
              <div className="mt-1.5">
                <PrintabilityBadge status={version.printabilityStatus} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
