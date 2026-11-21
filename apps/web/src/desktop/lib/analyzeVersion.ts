import type * as THREE from "three";
import { binaryStlTriangleCount, friendlyAnalysisError, type AnalysisLimits } from "@meshdiff/shared/analysisLimits";
import { generateChangeSummary } from "@meshdiff/shared/generateSummary";
import type { LocalAnalysis, LocalVersion } from "@meshdiff/shared/localLibrary";
import { loadMeshGeometry } from "../../engine/loadMesh";
import { computeVoxelDiffOffThread } from "../../lib/voxelDiffWorkerClient";
import { getAnalysisLimits } from "./analysisLimits";
import { library } from "./library";

/**
 * Parses a stored version's file into geometry (in a worker, like everywhere else). A model
 * bigger than this computer can comfortably handle is refused with an explanation, rather
 * than being allowed to exhaust memory (see shared/analysisLimits.ts for how the limit is set).
 */
export async function loadVersionGeometry(
  projectId: string,
  version: LocalVersion,
  limits?: AnalysisLimits,
): Promise<THREE.BufferGeometry> {
  const { maxTriangles } = limits ?? (await getAnalysisLimits());
  const bytes = await library().readVersionBytes(projectId, version.id);

  // A binary STL states its triangle count in its header, so an oversized one is refused
  // before spending any time or memory parsing it.
  const stated = version.format === "stl" ? binaryStlTriangleCount(bytes) : null;
  if (stated !== null && stated > maxTriangles) {
    throw new Error(
      `${version.fileName}: ${friendlyAnalysisError(`Mesh has ${stated.toLocaleString()} triangles, exceeding the limit`, { maxTriangles })}`,
    );
  }

  const result = await loadMeshGeometry(new File([bytes], version.fileName), { maxTriangles });
  if (!result.success) throw new Error(`${version.fileName}: ${friendlyAnalysisError(result.error, { maxTriangles })}`);
  return result.data;
}

/**
 * The offline counterpart of uploadVersion() in lib/uploadVersion.ts: diff this
 * version against the one before it (a project's first version is diffed against
 * itself, so printability/wall-thickness stats are still real with zero deltas),
 * using the same engine and worker as the website. Nothing leaves the machine.
 */
export async function analyzeVersion(
  projectId: string,
  version: LocalVersion,
  previous: LocalVersion | null,
): Promise<LocalAnalysis> {
  const limits = await getAnalysisLimits();
  const current = await loadVersionGeometry(projectId, version, limits);
  const base = previous ? await loadVersionGeometry(projectId, previous, limits) : current;

  const diff = await computeVoxelDiffOffThread(base, current, {
    fileFormatA: previous?.format ?? version.format,
    fileFormatB: version.format,
    maxTriangles: limits.maxTriangles,
  });
  if (!diff.success) throw new Error(friendlyAnalysisError(diff.error, limits));

  const { stats } = diff.data;
  return {
    stats,
    changeSummary: generateChangeSummary(stats),
    printabilityStatus: stats.printabilityStatus,
    comparedToVersionId: previous?.id ?? null,
    analyzedAt: new Date().toISOString(),
  };
}
