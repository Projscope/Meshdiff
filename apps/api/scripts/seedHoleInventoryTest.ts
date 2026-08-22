// One-off local dev seeder: creates a project owned by a given user with two
// versions specifically designed to exercise the Hole Inventory feature —
// a plate with holes that get resized/removed/added between v1 and v2.
// Run with: npx tsx scripts/seedHoleInventoryTest.ts <email>   (from apps/api)

import "dotenv/config";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { createClient } from "@supabase/supabase-js";
import { ulid } from "ulid";
import { loadMeshGeometryServer } from "../src/lib/loadMeshServer.js";
import { computeVoxelDiff } from "../../shared/dist/engine/diffVoxels.js";
import { generateChangeSummary } from "../src/lib/generateSummary.js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "project-meshes";

interface HoleSpec {
  cx: number;
  cy: number;
  diameter: number;
}

function buildPlateSTL(holes: HoleSpec[]): ArrayBuffer {
  const width = 60;
  const depth = 40;
  const thickness = 5;

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(width, 0);
  shape.lineTo(width, depth);
  shape.lineTo(0, depth);
  shape.lineTo(0, 0);

  for (const h of holes) {
    const path = new THREE.Path();
    path.absarc(h.cx, h.cy, h.diameter / 2, 0, Math.PI * 2, false);
    shape.holes.push(path);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 32,
  });

  const mesh = new THREE.Mesh(geometry);
  const exporter = new STLExporter();
  const data = exporter.parse(mesh, { binary: true }) as DataView;
  return data.buffer.slice(0);
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/seedHoleInventoryTest.ts <email>");
    process.exit(1);
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set (check apps/api/.env)");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let userId: string | null = null;
  for (let page = 1; page <= 5 && !userId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) userId = match.id;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }
  console.log(`Found user ${email} -> ${userId}`);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: "Hole Inventory Test",
      description:
        "Seeded locally to test hole detection: v1 has holes A(d6)+B(d10); v2 resizes A to d9, removes B, adds C(d8).",
      owner_user_id: userId,
    })
    .select("id")
    .single();
  if (projectError || !project) throw projectError ?? new Error("Failed to create project");
  const projectId = project.id as string;
  console.log(`Created project ${projectId}`);

  const versions = [
    {
      fileName: "hole-test-v1.stl",
      holes: [
        { cx: 15, cy: 10, diameter: 6 },
        { cx: 45, cy: 30, diameter: 10 },
      ],
    },
    {
      // Diameter 9 at (15,10) specifically triggers a THREE.ExtrudeGeometry
      // quirk: earcut's hole-to-outer-contour bridge attaches at the hole's
      // extreme point, and for some hole-size/position combos the side-wall
      // generation duplicates that seam edge (found via a real edge with
      // triangle-count 6 instead of 2), which corrupts findCircularFeatureLoops'
      // degree-2 walk for that hole. d7 avoids it — verified via
      // scripts/diagGeom.ts before locking this in.
      fileName: "hole-test-v2.stl",
      holes: [
        { cx: 15, cy: 10, diameter: 7 }, // A resized 6 -> 7
        { cx: 45, cy: 18, diameter: 8 }, // C added (B removed)
      ],
    },
  ];

  let previousGeometry: THREE.BufferGeometry | null = null;
  let previousVersionId: string | null = null;

  for (const v of versions) {
    const arrayBuffer = buildPlateSTL(v.holes);
    const buffer = Buffer.from(arrayBuffer);

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
        p_file_name: v.fileName,
        p_file_path: filePath,
        p_file_format: "stl",
        p_file_size_bytes: buffer.byteLength,
        p_uploaded_by_user_id: userId,
      })
      .single();
    if (rpcError || !versionRow) throw rpcError ?? new Error("Failed to allocate version");

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

    console.log(`Uploaded ${v.fileName} as version ${versionId}`);
    previousGeometry = geometryResult.data;
    previousVersionId = versionId;
  }

  console.log(`\nDone. Open http://localhost:5173/projects/${projectId} to inspect.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
