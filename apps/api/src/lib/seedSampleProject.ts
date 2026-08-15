import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type * as THREE from "three";
import { ulid } from "ulid";
import { computeVoxelDiff } from "../../../shared/dist/engine/diffVoxels";
import { loadMeshGeometryServer } from "./loadMeshServer.js";
import { generateChangeSummary } from "./generateSummary.js";

const BUCKET = "project-meshes";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "../../assets/sample-project");

const SAMPLE_VERSIONS = [
  { file: "sample-v1.stl", fileName: "bracket-v1.stl" },
  { file: "sample-v2.stl", fileName: "bracket-v2.stl" },
];

/**
 * Gives a brand-new workspace something to look at instead of "No projects
 * yet" — a small project with two versions, both genuinely "pass" (plain
 * boxes with no thin walls or unsupported overhangs, verified against the
 * real diff engine, not hardcoded). Best-effort: failures here are logged
 * and swallowed by the caller rather than blocking workspace creation,
 * since a missing sample project is a cosmetic gap, not a broken account.
 */
export async function seedSampleProject(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: "Sample Project",
      description: "An example project showing how version history and diffs work — feel free to delete this.",
      owner_user_id: userId,
    })
    .select("id")
    .single();
  if (projectError || !project) {
    throw projectError ?? new Error("Failed to create sample project");
  }
  const projectId = project.id as string;

  let previousGeometry: THREE.BufferGeometry | null = null;
  let previousVersionId: string | null = null;

  for (const sample of SAMPLE_VERSIONS) {
    const buffer = await readFile(path.join(ASSETS_DIR, sample.file));
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const geometryResult = await loadMeshGeometryServer(arrayBuffer, "stl");
    if (!geometryResult.success) throw new Error(geometryResult.error);

    const versionId = ulid();
    const filePath = `${projectId}/${versionId}.stl`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, buffer, {
      contentType: "application/octet-stream",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data: versionRow, error: rpcError } = await supabase
      .rpc("create_version", {
        p_id: versionId,
        p_project_id: projectId,
        p_file_name: sample.fileName,
        p_file_path: filePath,
        p_file_format: "stl",
        p_file_size_bytes: buffer.byteLength,
        p_uploaded_by_user_id: userId,
      })
      .single();
    if (rpcError || !versionRow) throw rpcError ?? new Error("Failed to allocate sample version");

    const baseGeometry = previousGeometry ?? geometryResult.data;
    const diffResult = computeVoxelDiff(baseGeometry, geometryResult.data, {
      fileFormatA: "stl",
      fileFormatB: "stl",
    });
    if (!diffResult.success) throw new Error(diffResult.error);

    const { stats } = diffResult.data;
    const { error: updateError } = await supabase
      .from("versions")
      .update({
        triangle_count: Math.round(stats.triangleDeltaB),
        change_summary: generateChangeSummary(stats),
        printability_status: stats.printabilityStatus,
        approval_status: "approved",
      })
      .eq("id", versionId);
    if (updateError) throw updateError;

    if (previousVersionId) {
      await supabase.from("version_diffs").upsert(
        {
          project_id: projectId,
          version_a_id: previousVersionId,
          version_b_id: versionId,
          stats,
          printability_status: stats.printabilityStatus,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "version_a_id,version_b_id" },
      );
    }

    previousGeometry = geometryResult.data;
    previousVersionId = versionId;
  }
}
