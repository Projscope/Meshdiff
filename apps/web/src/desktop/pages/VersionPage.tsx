import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { LocalComment, LocalCommentStatus, Vec3 } from "@meshdiff/shared/localLibrary";
import type { CommentSummary } from "../../lib/projectsApi";
import CommentPin from "../../components/CommentPin";
import CommentPopover from "../../components/CommentPopover";
import CommentsPanel from "../../components/CommentsPanel";
import ConfirmDialog from "../../components/ConfirmDialog";
import DetailedStatsPanel from "../../components/DetailedStatsPanel";
import PendingCommentPopover from "../../components/PendingCommentPopover";
import PrintabilityBadge from "../../components/PrintabilityBadge";
import ReadOnlyMeshViewer from "../../components/ReadOnlyMeshViewer";
import { loadVersionGeometry } from "../lib/analyzeVersion";
import { errorMessage, formatBytes, formatDateTime, library } from "../lib/library";
import { useProject } from "../lib/useProject";

// The viewer draws the model inside a group rotated -90deg about X (Z-up model
// data onto the Y-up grid), so a clicked world point goes back through the
// inverse to get model coordinates, the same convention the cloud's comments use.
const GROUP_ROTATION_INVERSE = new THREE.Matrix4().makeRotationX(Math.PI / 2);

/** The shared comment components were built for cloud comments; local ones fit the same shape. */
function toSummary(comment: LocalComment): CommentSummary {
  return {
    id: comment.id,
    authorUserId: null,
    authorEmail: "You",
    parentCommentId: comment.parentCommentId,
    body: comment.body,
    position: comment.position,
    normal: comment.normal,
    status: comment.status,
    assigneeUserId: null,
    assigneeEmail: null,
    priority: null,
    statusChangedAt: comment.status === "open" ? null : comment.updatedAt,
    createdAt: comment.createdAt,
  };
}

export default function VersionPage() {
  const { projectId = "", versionId = "" } = useParams();
  const { detail, loadError, refresh } = useProject(projectId);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<Vec3 | null>(null);
  const [pendingNormal, setPendingNormal] = useState<Vec3 | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CommentSummary | null>(null);

  const version = detail?.versions.find((v) => v.id === versionId) ?? null;

  useEffect(() => {
    if (!version) return;
    let cancelled = false;
    setGeometry(null);
    setGeometryError(null);
    loadVersionGeometry(projectId, version)
      .then((g) => !cancelled && setGeometry(g))
      .catch((e) => !cancelled && setGeometryError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // Reload only when the file itself changes, not on every refresh of the project.
  }, [projectId, version?.id, version?.sha256]); // eslint-disable-line react-hooks/exhaustive-deps

  const comments = useMemo(
    () => (detail?.comments ?? []).filter((c) => c.versionId === versionId).map(toSummary),
    [detail, versionId],
  );
  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentCommentId === id);

  const boundingBox = useMemo<[number, number, number]>(() => {
    if (!geometry) return [0, 0, 0];
    geometry.computeBoundingBox();
    const size = geometry.boundingBox?.getSize(new THREE.Vector3());
    return size ? [size.x, size.y, size.z] : [0, 0, 0];
  }, [geometry]);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  function handleMeshClick(event: ThreeEvent<MouseEvent>) {
    if (!event.face) return;
    event.stopPropagation();
    const point = event.point.clone().applyMatrix4(GROUP_ROTATION_INVERSE);
    setPendingPosition([point.x, point.y, point.z]);
    const normal = event.face.normal.clone().transformDirection(event.object.matrixWorld);
    setPendingNormal([normal.x, normal.y, normal.z]);
    setSelectedId(null);
  }

  function cancelPending() {
    setPendingPosition(null);
    setPendingNormal(null);
    setIsPlacing(false);
  }

  async function submitComment(body: string) {
    if (!pendingPosition) return;
    const position = pendingPosition;
    const normal = pendingNormal;
    await run(() => library().addComment(projectId, { versionId, body, position, normal }));
    cancelPending();
  }

  const toggleStatus = (comment: CommentSummary) => {
    const next: LocalCommentStatus = comment.status === "resolved" ? "reopened" : "resolved";
    void run(() => library().setCommentStatus(projectId, comment.id, next));
  };

  if (loadError) return <p role="alert" className="p-6 text-sm text-red-300">{loadError}</p>;
  if (detail === undefined) return <p className="p-6 text-sm text-ink-500">Loading…</p>;
  if (detail === null || !version) {
    return (
      <div className="p-6 text-sm text-ink-400">
        This version no longer exists. <Link to={`/p/${projectId}`} className="text-accent-fg-400 underline">Back to the project</Link>
      </div>
    );
  }

  const analysis = version.analysis;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 md:flex-row">
      <div className="relative min-h-[350px] min-w-0 flex-1">
        <ReadOnlyMeshViewer
          label={`v${version.number}`}
          fallbackLabel={`v${version.number}`}
          geometry={geometry}
          onMeshClick={isPlacing ? handleMeshClick : undefined}
        >
          {topLevel.map((comment) => (
            <CommentPin
              key={comment.id}
              position={comment.position}
              label={comment.body}
              highlighted={hoveredId === comment.id || selectedId === comment.id}
              onHoverChange={(hovering) => setHoveredId(hovering ? comment.id : null)}
              onSelect={() => setSelectedId(comment.id)}
              messageCount={1 + repliesOf(comment.id).length}
            />
          ))}
          {topLevel
            .filter((comment) => hoveredId === comment.id || selectedId === comment.id)
            .map((comment) => (
              <CommentPopover
                key={comment.id}
                comment={comment}
                replies={repliesOf(comment.id)}
                members={[]}
                canDelete={() => true}
                canChangeStatus={() => true}
                onClose={() => setSelectedId(null)}
                onDelete={setPendingDelete}
                onToggleStatus={toggleStatus}
                onReply={(body) =>
                  run(() => library().addComment(projectId, { versionId, body, position: comment.position, parentCommentId: comment.id }))
                }
              />
            ))}
          {pendingPosition && (
            <>
              <CommentPin position={pendingPosition} pending />
              <PendingCommentPopover position={pendingPosition} members={[]} onSubmit={submitComment} onCancel={cancelPending} />
            </>
          )}
        </ReadOnlyMeshViewer>
        {!geometry && !geometryError && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-ink-400">Loading model…</div>
        )}
        {geometryError && (
          <div role="alert" className="absolute inset-x-3 top-12 z-10 rounded-sm border border-red-800 bg-red-950/80 px-3 py-2 text-sm text-red-300">
            {geometryError}
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 overflow-y-auto rounded-lg border border-ink-800 bg-ink-900 p-3 text-sm md:w-80">
        <Link to={`/p/${projectId}`} className="text-xs text-ink-500 hover:text-ink-300">← {detail.project.name}</Link>
        <h1 data-testid="version-title" className="mt-2 truncate text-sm font-semibold text-ink-50">
          v{version.number} · {version.fileName}
        </h1>
        <p className="mt-1 text-xs text-ink-500">
          {formatBytes(version.sizeBytes)} · {formatDateTime(version.createdAt)}
          <br />
          sha256 <span className="font-mono">{version.sha256.slice(0, 16)}…</span>
        </p>

        {actionError && (
          <div role="alert" className="mt-3 rounded-sm border border-red-800 bg-red-950/50 px-2 py-1.5 text-xs text-red-300">{actionError}</div>
        )}

        {analysis ? (
          <>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Printability</span>
              <PrintabilityBadge status={analysis.printabilityStatus} />
            </div>
            <p className="mt-2 text-xs text-ink-300">{analysis.changeSummary}</p>
            <div className="mt-4">
              <DetailedStatsPanel stats={analysis.stats} hasComparison={analysis.comparedToVersionId !== null} boundingBoxB={boundingBox} />
            </div>
          </>
        ) : (
          <p className="mt-4 text-xs text-ink-500">Analyzing this version…</p>
        )}

        <div className="mt-5">
          <CommentsPanel
            comments={comments}
            isPlacingComment={isPlacing}
            onTogglePlacing={() => (isPlacing ? cancelPending() : setIsPlacing(true))}
            pendingPosition={pendingPosition}
            onCancelPending={cancelPending}
            highlightedCommentId={hoveredId ?? selectedId}
            onHoverComment={setHoveredId}
            onSelectComment={setSelectedId}
            canDeleteComment={() => true}
            onRequestDelete={setPendingDelete}
            canChangeStatus={() => true}
            onToggleStatus={toggleStatus}
          />
        </div>
      </aside>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete comment?"
          message="This comment and its replies will be permanently deleted from this computer."
          confirmLabel="Delete"
          isDestructive
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            setSelectedId(null);
            void run(() => library().deleteComment(projectId, target.id));
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
