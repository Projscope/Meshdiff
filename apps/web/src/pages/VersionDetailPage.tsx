import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as THREE from "three";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import {
  getVersion,
  getDiff,
  listComments,
  createComment,
  type VersionDetail,
  type CommentSummary,
} from "../lib/projectsApi";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";
import { loadMeshGeometry } from "../engine/loadMesh";
import PrintabilityBadge from "../components/PrintabilityBadge";
import PrintabilityRulesTooltip from "../components/PrintabilityRulesTooltip";
import DetailedStatsPanel from "../components/DetailedStatsPanel";
import CommentsPanel from "../components/CommentsPanel";
import CommentPin from "../components/CommentPin";
import AxisLegend from "../components/AxisLegend";
import AxisLabels from "../components/AxisLabels";

export default function VersionDetailPage() {
  const { projectId, versionId } = useParams<{ projectId: string; versionId: string }>();
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [diffStats, setDiffStats] = useState<VoxelDiffStats | null>(null);
  const [hasComparison, setHasComparison] = useState(false);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [boundingBox, setBoundingBox] = useState<[number, number, number]>([0, 0, 0]);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<CommentSummary[]>([]);
  const [isPlacingComment, setIsPlacingComment] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<[number, number, number] | null>(null);
  const [pendingNormal, setPendingNormal] = useState<[number, number, number] | undefined>();

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

      // No previous version (v1): self-diff still yields real per-mesh
      // Version Stats/Printability values for the "B" side (same trick
      // finalize uses server-side) — just don't treat the zeroed-out
      // deltas as a real comparison for the Geometric Delta section.
      const versionAId = result.data.previousVersionId ?? versionId;
      setHasComparison(result.data.previousVersionId !== null);
      getDiff(versionAId, versionId).then((diffResult) => {
        if (!cancelled && diffResult.success) setDiffStats(diffResult.data);
      });

      const response = await fetch(result.data.downloadUrl);
      const blob = await response.blob();
      const meshResult = await loadMeshGeometry(new File([blob], result.data.fileName));
      if (cancelled) return;
      if (meshResult.success) {
        setGeometry(meshResult.data);
        meshResult.data.computeBoundingBox();
        const box = meshResult.data.boundingBox;
        if (box) {
          const size = box.getSize(new THREE.Vector3());
          setBoundingBox([size.x, size.y, size.z]);
        }
      } else {
        setError(meshResult.error);
      }
    });

    listComments(projectId, versionId).then((result) => {
      if (!cancelled && result.success) setComments(result.data);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId]);

  function handleMeshClick(event: ThreeEvent<MouseEvent>) {
    if (!isPlacingComment) return;
    event.stopPropagation();
    const point = event.point;
    setPendingPosition([point.x, point.y, point.z]);
    if (event.face?.normal && event.object) {
      const worldNormal = event.face.normal.clone().transformDirection(event.object.matrixWorld);
      setPendingNormal([worldNormal.x, worldNormal.y, worldNormal.z]);
    } else {
      setPendingNormal(undefined);
    }
    setIsPlacingComment(false);
  }

  async function handleSubmitComment(body: string) {
    if (!projectId || !versionId || !pendingPosition) return;
    const result = await createComment(projectId, versionId, body, pendingPosition, pendingNormal);
    if (result.success) {
      setComments((prev) => [...prev, result.data]);
      setPendingPosition(null);
      setPendingNormal(undefined);
    }
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] w-full gap-4 px-4 py-4">
      <div
        className={`relative flex-1 overflow-hidden rounded-lg border bg-neutral-950 ${
          isPlacingComment ? "border-indigo-500" : "border-neutral-800"
        }`}
      >
        <Canvas camera={{ position: [50, 50, 50], fov: 45 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 10]} intensity={0.8} />
          <Grid infiniteGrid cellColor="#333" sectionColor="#555" />
          {/* The grid is drei's default Y-up floor; this app's model data is
              Z-up (see diffVoxels.ts's gravity vector), so the displayed
              content — including comment pins, whose stored positions come
              from raycasting against the (now rotated) mesh — is rotated
              -90° around X to lay it flat on that floor. Purely a
              presentation transform, doesn't touch the geometry used for
              diffing/printability. */}
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <axesHelper args={[30]} />
            <AxisLabels />
            {geometry && (
              <Bounds fit clip observe margin={1.2}>
                <mesh geometry={geometry} onClick={handleMeshClick}>
                  <meshStandardMaterial color="#4f8ff7" />
                </mesh>
              </Bounds>
            )}
            {comments.map((comment) => (
              <CommentPin key={comment.id} position={comment.position} label={comment.body} />
            ))}
            {pendingPosition && <CommentPin position={pendingPosition} pending />}
          </group>
          <OrbitControls makeDefault />
        </Canvas>
        <AxisLegend />
      </div>

      <div className="w-80 shrink-0 overflow-y-auto">
        <Link to={`/projects/${projectId}`} className="text-xs text-neutral-500 hover:text-neutral-300">
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
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Printability Gate
              </h3>
              <PrintabilityRulesTooltip>
                <PrintabilityBadge status={version.printabilityStatus} />
              </PrintabilityRulesTooltip>
            </div>

            <div className="mt-5">
              <DetailedStatsPanel
                stats={diffStats}
                hasComparison={hasComparison}
                boundingBoxB={boundingBox}
              />
            </div>

            <div className="mt-5">
              <CommentsPanel
                comments={comments}
                isPlacingComment={isPlacingComment}
                onTogglePlacing={() => setIsPlacingComment((prev) => !prev)}
                pendingPosition={pendingPosition}
                onSubmitComment={handleSubmitComment}
                onCancelPending={() => {
                  setPendingPosition(null);
                  setPendingNormal(undefined);
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
