// One-off maintenance script: recomputes triangle_count / change_summary /
// printability_status for every existing version, using the same
// computeVoxelDiff() pipeline finalize() uses. Needed after fixing the
// overhang-analysis bugs in diffVoxels.ts (vector-aliasing corruption +
// missing build-plate exclusion) that made every closed solid mesh score
// "fail" regardless of its actual geometry — existing data was computed
// with the broken version and needs to be refreshed.
//
// Does NOT touch approval_status — re-running the (now-fixed) printability
// check isn't a review decision and shouldn't silently re-approve a
// rejected version or bypass a pending team review.
//
// Run with: npx tsx scripts/recalculatePrintability.ts

import "dotenv/config";
import { getSupabase } from "../src/lib/supabase.js";
import { loadMeshGeometryServer } from "../src/lib/loadMeshServer.js";
import { generateChangeSummary } from "../src/lib/generateSummary.js";
import { computeVoxelDiff } from "@meshdiff/shared/engine/diffVoxels.js";
import type * as THREE from "three";

const BUCKET = "project-meshes";

interface VersionRow {
  id: string;
  version_number: number;
  file_name: string;
  file_path: string;
  file_format: "stl" | "obj" | "3mf";
}

async function main() {
  const supabase = getSupabase();
  if (!supabase) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
    process.exit(1);
  }

  const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name");
  if (projectsError) throw projectsError;

  let updated = 0;
  let failed = 0;
  const before: Record<string, number> = {};
  const after: Record<string, number> = {};

  for (const project of projects ?? []) {
    const { data: versions, error: versionsError } = await supabase
      .from("versions")
      .select("id, version_number, file_name, file_path, file_format, printability_status")
      .eq("project_id", project.id)
      .order("version_number", { ascending: true });
    if (versionsError) {
      console.error(`Failed to list versions for project "${project.name}" (${project.id})`, versionsError);
      continue;
    }

    let previousGeometry: THREE.BufferGeometry | null = null;
    let previousFormat: "stl" | "obj" | "3mf" | null = null;
    let previousId: string | null = null;

    for (const version of (versions ?? []) as (VersionRow & { printability_status: string | null })[]) {
      const oldStatus = version.printability_status ?? "(none)";
      before[oldStatus] = (before[oldStatus] ?? 0) + 1;

      try {
        const { data: blob, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .download(version.file_path);
        if (downloadError || !blob) throw downloadError ?? new Error("file missing from storage");

        const buffer = await blob.arrayBuffer();
        const geoResult = await loadMeshGeometryServer(buffer, version.file_format);
        if (!geoResult.success) throw new Error(geoResult.error);

        const baseGeometry = previousGeometry ?? geoResult.data;
        const baseFormat = previousFormat ?? version.file_format;

        const diffResult = computeVoxelDiff(baseGeometry, geoResult.data, {
          fileFormatA: baseFormat,
          fileFormatB: version.file_format,
        });
        if (!diffResult.success) throw new Error(diffResult.error);

        const { stats } = diffResult.data;
        const { error: updateError } = await supabase
          .from("versions")
          .update({
            triangle_count: Math.round(stats.triangleDeltaB),
            change_summary: generateChangeSummary(stats),
            printability_status: stats.printabilityStatus,
          })
          .eq("id", version.id);
        if (updateError) throw updateError;

        if (previousId) {
          await supabase.from("version_diffs").upsert(
            {
              project_id: project.id,
              version_a_id: previousId,
              version_b_id: version.id,
              stats,
              printability_status: stats.printabilityStatus,
              computed_at: new Date().toISOString(),
            },
            { onConflict: "version_a_id,version_b_id" },
          );
        }

        after[stats.printabilityStatus] = (after[stats.printabilityStatus] ?? 0) + 1;
        console.log(
          `  ${oldStatus === stats.printabilityStatus ? "=" : "*"} ${project.name} v${version.version_number} (${version.file_name}): ${oldStatus} -> ${stats.printabilityStatus}`,
        );
        updated++;
        previousGeometry = geoResult.data;
        previousFormat = version.file_format;
        previousId = version.id;
      } catch (err) {
        after["(failed)"] = (after["(failed)"] ?? 0) + 1;
        console.error(`  ✗ ${project.name} v${version.version_number} (${version.file_name}):`, err);
        failed++;
        // Don't advance previousGeometry — the next version's diff falls
        // back to comparing against itself rather than a broken baseline.
      }
    }
  }

  console.log(`\nDone. ${updated} updated, ${failed} failed.`);
  console.log("Before:", before);
  console.log("After: ", after);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
