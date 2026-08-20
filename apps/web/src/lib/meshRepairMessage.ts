import type { MeshRepairReport } from "@meshdiff/shared/engine/repairMesh";

/**
 * Turns a mesh's repair report into a user-facing warning, or null if the
 * mesh didn't need real cleanup. Welded-vertex count alone isn't a signal —
 * parsed geometry is non-indexed by construction (see repairMesh.ts's doc
 * comment), so it's always nonzero and doesn't mean anything went wrong.
 */
export function meshRepairWarning(report: MeshRepairReport): string | null {
  const parts: string[] = [];
  if (report.removedDegenerateTriangleCount > 0) {
    const n = report.removedDegenerateTriangleCount;
    parts.push(`removed ${n} degenerate triangle${n === 1 ? "" : "s"}`);
  }
  if (!report.isManifold) {
    const n = report.openBoundaryLoopCount;
    parts.push(
      `found ${n} open region${n === 1 ? "" : "s"} — this mesh isn't fully watertight, so wall-thickness/hole readings may be approximate`,
    );
  }
  if (parts.length === 0) return null;
  return `Cleaned up on load: ${parts.join("; ")}.`;
}
