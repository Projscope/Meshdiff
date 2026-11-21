import type * as THREE from "three";
import { generateChangeSummary } from "@meshdiff/shared/generateSummary";
import type { LocalAnalysis, LocalVersion } from "@meshdiff/shared/localLibrary";
import { loadMeshGeometry } from "../../engine/loadMesh";
import { computeVoxelDiffOffThread } from "../../lib/voxelDiffWorkerClient";
import { library } from "./library";

/** Parses a stored version's file into geometry (in a worker, like everywhere else). */
export async function loadVersionGeometry(projectId: string, version: LocalVersion): Promise<THREE.BufferGeometry> {
  const bytes = await library().readVersionBytes(projectId, version.id);
  const result = await loadMeshGeometry(new File([bytes], version.fileName));
  if (!result.success) throw new Error(`${version.fileName}: ${result.error}`);
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
  const current = await loadVersionGeometry(projectId, version);
  const base = previous ? await loadVersionGeometry(projectId, previous) : current;

  const diff = await computeVoxelDiffOffThread(base, current, {
    fileFormatA: previous?.format ?? version.format,
    fileFormatB: version.format,
  });
  if (!diff.success) throw new Error(diff.error);

  const { stats } = diff.data;
  return {
    stats,
    changeSummary: generateChangeSummary(stats),
    printabilityStatus: stats.printabilityStatus,
    comparedToVersionId: previous?.id ?? null,
    analyzedAt: new Date().toISOString(),
  };
}
