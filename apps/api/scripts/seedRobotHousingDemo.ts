// Throwaway local-only demo seeder — creates a "Robot Housing" Team project
// with v13 (Changes Requested), v14 (In Review), v15 (Approved), plus the
// "Alex: This wall looks too thin." comment on v13, to mirror the homepage
// hero/revision-history mockup with real product data.
// Run with: npx tsx scripts/seedRobotHousingDemo.ts <owner-email>   (from apps/api)

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

function buildBoxSTL(size: [number, number, number]): ArrayBuffer {
  const geometry = new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry);
  const exporter = new STLExporter();
  const data = exporter.parse(mesh, { binary: true }) as DataView;
  return data.buffer.slice(0);
}

async function findUserByEmail(supabase: ReturnType<typeof createClient>, email: string): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  const ownerEmail = process.argv[2];
  if (!ownerEmail) {
    console.error("Usage: npx tsx scripts/seedRobotHousingDemo.ts <owner-email>");
    process.exit(1);
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set (check apps/api/.env)");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const ownerId = await findUserByEmail(supabase, ownerEmail);
  if (!ownerId) {
    console.error(`No user found with email ${ownerEmail} — sign up with this email first`);
    process.exit(1);
  }
  console.log(`Owner: ${ownerEmail} -> ${ownerId}`);

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .insert({ name: "Robot Housing Team", owner_user_id: ownerId })
    .select("id")
    .single();
  if (teamError || !team) throw teamError ?? new Error("Failed to create team");
  const teamId = (team as { id: string }).id;
  console.log(`Created team ${teamId}`);

  const { error: membersError } = await supabase.from("team_members").insert({
    team_id: teamId,
    user_id: ownerId,
    role: "admin",
  });
  if (membersError) throw membersError;

  // Team-tier write access requires the owner to have an active 'team'
  // subscription (has_active_team_access) — upsert one if not already there.
  const { error: subscriptionError } = await supabase.from("subscriptions").upsert(
    {
      user_id: ownerId,
      stripe_subscription_id: `sub_robot_housing_demo_${ownerId}`,
      stripe_price_id: "price_demo_team",
      status: "active",
      tier: "team",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (subscriptionError) throw subscriptionError;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: "Robot Housing",
      description: "Demo project mirroring the homepage revision-history mockup.",
      owner_user_id: ownerId,
      team_id: teamId,
    })
    .select("id")
    .single();
  if (projectError || !project) throw projectError ?? new Error("Failed to create project");
  const projectId = (project as { id: string }).id;
  console.log(`Created project ${projectId}`);

  const versions = [
    { fileName: "robot-housing-v13.stl", size: [40, 30, 20] as [number, number, number] },
    { fileName: "robot-housing-v14.stl", size: [40, 30, 22] as [number, number, number] },
    { fileName: "robot-housing-v15.stl", size: [42, 30, 22] as [number, number, number] },
  ];

  let previousGeometry: THREE.BufferGeometry | null = null;
  const versionIds: string[] = [];

  for (const v of versions) {
    const arrayBuffer = buildBoxSTL(v.size);
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
        p_uploaded_by_user_id: ownerId,
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
      })
      .eq("id", versionId);
    if (updateError) throw updateError;

    console.log(`Uploaded ${v.fileName} as version ${versionId}`);
    previousGeometry = geometryResult.data;
    versionIds.push(versionId);
  }

  const [v13Id, v14Id, v15Id] = versionIds;

  // Bump displayed version numbers to 13/14/15 purely for cosmetic parity
  // with the homepage mockup — create_version() allocates 1/2/3 for a
  // brand-new project, and nothing else depends on these being sequential
  // from 1.
  await supabase.from("versions").update({ version_number: 13 }).eq("id", v13Id);
  await supabase.from("versions").update({ version_number: 14 }).eq("id", v14Id);
  await supabase.from("versions").update({ version_number: 15 }).eq("id", v15Id);

  // v13: changes requested, with the same "wall too thin" reason as the
  // homepage's comment example.
  await supabase
    .from("versions")
    .update({
      approval_status: "changes_requested",
      reviewed_by_user_id: ownerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: "Wall thickness near the mounting boss dropped to 0.6mm — please thicken before resubmitting.",
    })
    .eq("id", v13Id);
  await supabase.from("version_reviews").insert({
    version_id: v13Id,
    actor_user_id: ownerId,
    from_status: "in_review",
    to_status: "changes_requested",
    reason: "Wall thickness near the mounting boss dropped to 0.6mm — please thicken before resubmitting.",
  });

  // v14: left as "in_review" (create_version's default).

  // v15: approved.
  await supabase
    .from("versions")
    .update({
      approval_status: "approved",
      reviewed_by_user_id: ownerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", v15Id);
  await supabase.from("version_reviews").insert({
    version_id: v15Id,
    actor_user_id: ownerId,
    from_status: "in_review",
    to_status: "approved",
    reason: null,
  });

  // The homepage hero's comment example, pinned on v13.
  await supabase.from("comments").insert({
    version_id: v13Id,
    author_user_id: ownerId,
    body: "This wall looks too thin.",
    position_x: 20,
    position_y: 15,
    position_z: 10,
  });

  console.log(`\nv13=${v13Id} changes_requested, v14=${v14Id} in_review, v15=${v15Id} approved`);
  console.log(`\nOpen http://localhost:5173/projects/${projectId} to inspect.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
