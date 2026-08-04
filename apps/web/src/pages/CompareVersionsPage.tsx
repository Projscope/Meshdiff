import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as THREE from "three";
import { getVersion, type VersionDetail } from "../lib/projectsApi";
import { loadMeshGeometry } from "../engine/loadMesh";
import DiffView, { type DiffMode } from "../components/DiffView";
import DetailedStatsPanel from "../components/DetailedStatsPanel";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";

export default function CompareVersionsPage() {
  const { projectId, versionId } = useParams<{ projectId: string; versionId: string }>();
  const [versionA, setVersionA] = useState<VersionDetail | null>(null);
  const [versionB, setVersionB] = useState<VersionDetail | null>(null);
  const [geometryA, setGeometryA] = useState<THREE.BufferGeometry | null>(null);
  const [geometryB, setGeometryB] = useState<THREE.BufferGeometry | null>(null);
  const [mode, setMode] = useState<DiffMode>("voxel");
  const [toleranceMm, setToleranceMm] = useState(0.15);
  const [stats, setStats] = useState<(VoxelDiffStats & { toleranceMm: number }) | null>(null);
  const [boundingBoxB, setBoundingBoxB] = useState<[number, number, number]>([0, 0, 0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !versionId) return;
    let cancelled = false;

    async function loadVersion(id: string): Promise<{ detail: VersionDetail; geometry: THREE.BufferGeometry } | null> {
      const result = await getVersion(projectId!, id);
      if (!result.success) {
        if (!cancelled) setError(result.error);
        return null;
      }
      const response = await fetch(result.data.downloadUrl);
      const blob = await response.blob();
      const meshResult = await loadMeshGeometry(new File([blob], result.data.fileName));
      if (!meshResult.success) {
        if (!cancelled) setError(meshResult.error);
        return null;
      }
      return { detail: result.data, geometry: meshResult.data };
    }

    getVersion(projectId, versionId).then(async (currentResult) => {
      if (cancelled || !currentResult.success) {
        if (!cancelled && !currentResult.success) setError(currentResult.error);
        return;
      }
      if (!currentResult.data.previousVersionId) {
        if (!cancelled) setError("No previous version to compare against.");
        return;
      }

      const [a, b] = await Promise.all([
        loadVersion(currentResult.data.previousVersionId),
        loadVersion(versionId),
      ]);
      if (cancelled) return;
      if (a) {
        setVersionA(a.detail);
        setGeometryA(a.geometry);
      }
      if (b) {
        setVersionB(b.detail);
        setGeometryB(b.geometry);
        b.geometry.computeBoundingBox();
        const box = b.geometry.boundingBox;
        if (box) {
          const size = box.getSize(new THREE.Vector3());
          setBoundingBoxB([size.x, size.y, size.z]);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId]);

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-6xl gap-4 px-4 py-4">
      <div className="flex-1 overflow-hidden">
        <DiffView
          geometryA={geometryA}
          geometryB={geometryB}
          mode={mode}
          onModeChange={setMode}
          toleranceMm={toleranceMm}
          onToleranceChange={setToleranceMm}
          onStatsChange={setStats}
        />
      </div>

      <div className="w-80 shrink-0 overflow-y-auto">
        <Link
          to={`/projects/${projectId}/versions/${versionId}`}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          ← Back to version
        </Link>

        {error && (
          <div className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {versionA && versionB && (
          <>
            <h1 className="mt-2 text-sm font-semibold text-white">
              v{versionA.versionNumber} → v{versionB.versionNumber}
            </h1>
            <p className="mt-0.5 truncate text-xs text-neutral-500">
              {versionA.fileName} vs {versionB.fileName}
            </p>

            <div className="mt-5">
              <DetailedStatsPanel stats={stats} hasComparison boundingBoxB={boundingBoxB} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
