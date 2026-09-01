// One-off local dev seeder: creates a Team project with versions across the
// review state machine (in_review/changes_requested/approved) plus threaded
// comments from different roles, so the comment and version-approval UI can
// be tested without clicking through real uploads/invites/subscriptions first.
// Run with: npx tsx scripts/seedApprovalTest.ts <owner-email>   (from apps/api)
//
// The owner account must already exist (sign up normally first). Two
// additional test accounts (an "approver" and a plain "member") are
// created automatically if they don't already exist:
//   qa-approver@meshdiff.test / MeshdiffTest123!
//   qa-member@meshdiff.test   / MeshdiffTest123!

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
const TEST_PASSWORD = "MeshdiffTest123!";

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

async function findOrCreateUser(supabase: ReturnType<typeof createClient>, email: string): Promise<string> {
  const existing = await findUserByEmail(supabase, email);
  if (existing) {
    console.log(`Found existing user ${email} -> ${existing}`);
    return existing;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Failed to create user ${email}`);
  console.log(`Created user ${email} -> ${data.user.id} (password: ${TEST_PASSWORD})`);
  return data.user.id;
}

async function main() {
  const ownerEmail = process.argv[2];
  if (!ownerEmail) {
    console.error("Usage: npx tsx scripts/seedApprovalTest.ts <owner-email>");
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

  const approverId = await findOrCreateUser(supabase, "qa-approver@meshdiff.test");
  const memberId = await findOrCreateUser(supabase, "qa-member@meshdiff.test");

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .insert({ name: "QA Approval Team", owner_user_id: ownerId })
    .select("id")
    .single();
  if (teamError || !team) throw teamError ?? new Error("Failed to create team");
  const teamId = (team as { id: string }).id;
  console.log(`Created team ${teamId}`);

  const { error: membersError } = await supabase.from("team_members").insert([
    { team_id: teamId, user_id: ownerId, role: "admin" },
    { team_id: teamId, user_id: approverId, role: "approver" },
    { team_id: teamId, user_id: memberId, role: "member" },
  ]);
  if (membersError) throw membersError;
  console.log("Added members: owner=admin, qa-approver=approver, qa-member=member");

  // Team members with no subscription of their own only get write access
  // (comment, approve/reject, etc. — see requireProjectWriteAccess) via
  // has_active_team_access(), which requires the *owner* to have an
  // active 'team' subscription row — without this, qa-approver/qa-member
  // can view everything but every mutation 403s silently in the UI.
  const { error: subscriptionError } = await supabase.from("subscriptions").upsert(
    {
      user_id: ownerId,
      stripe_subscription_id: `sub_qa_test_${ownerId}`,
      stripe_price_id: "price_qa_test_team",
      status: "active",
      tier: "team",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (subscriptionError) throw subscriptionError;
  console.log("Gave owner an active Team subscription so team-member write access works");

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: "QA Approval Test",
      description: "Seeded locally to test the version-approval and comment workflows across roles.",
      owner_user_id: ownerId,
      team_id: teamId,
    })
    .select("id")
    .single();
  if (projectError || !project) throw projectError ?? new Error("Failed to create project");
  const projectId = (project as { id: string }).id;
  console.log(`Created project ${projectId}`);

  const versions = [
    { fileName: "bracket-v1.stl", size: [30, 20, 10] as [number, number, number] },
    { fileName: "bracket-v2.stl", size: [30, 20, 14] as [number, number, number] },
    { fileName: "bracket-v3.stl", size: [34, 20, 14] as [number, number, number] },
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
        p_uploaded_by_user_id: memberId,
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

    if (versionIds.length > 0) {
      await supabase.from("version_diffs").upsert(
        {
          project_id: projectId,
          version_a_id: versionIds[versionIds.length - 1],
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
    versionIds.push(versionId);
  }

  // Approval gates: created after the versions exist, since this script
  // inserts version rows directly via RPC rather than going through the
  // API's finalize() route (which is what normally auto-seeds a
  // fulfillment row per active gate on upload — see seedGateFulfillments()
  // in apps/api/src/routes/versions.ts). Fulfillment rows are inserted by
  // hand below to reproduce that for the seeded versions.
  const { data: gateRows, error: gatesError } = await supabase
    .from("approval_gate_definitions")
    .insert([
      { project_id: projectId, label: "Geometry reviewed", sort_order: 0 },
      { project_id: projectId, label: "Printability passed", sort_order: 1 },
    ])
    .select("id");
  if (gatesError || !gateRows) throw gatesError ?? new Error("Failed to create approval gates");
  const [geometryGateId, printabilityGateId] = (gateRows as Array<{ id: string }>).map((g) => g.id);
  console.log(`Created approval gates: geometry=${geometryGateId}, printability=${printabilityGateId}`);

  const [v1Id, v2Id, v3Id] = versionIds;

  // v1: approved baseline
  await supabase
    .from("versions")
    .update({ approval_status: "approved", reviewed_by_user_id: ownerId, reviewed_at: new Date().toISOString() })
    .eq("id", v1Id);

  // v2: changes requested, with a reason — exercises RejectVersionModal /
  // ApprovalBadge's changes_requested state
  await supabase
    .from("versions")
    .update({
      approval_status: "changes_requested",
      reviewed_by_user_id: approverId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: "Wall thickness under 0.8mm near the mounting tab — please thicken before resubmitting.",
    })
    .eq("id", v2Id);

  // v3: left as "in_review" (create_version's default) — the one to
  // actually approve/request-changes by hand while testing.
  console.log(`v1=${v1Id} approved, v2=${v2Id} changes_requested, v3=${v3Id} in_review`);

  // Fulfillments: v1 fully satisfied (it's already approved, both gates
  // checked retroactively); v3 only partially satisfied, so approving it
  // by hand should 403 with "gates_unsatisfied" until the second gate is
  // checked off — the blocked case the plan's verification checklist calls
  // for. v2 gets no fulfillment rows (changes_requested doesn't need one to
  // exercise the checklist UI's empty state).
  await supabase.from("approval_gate_fulfillments").insert([
    { version_id: v1Id, gate_definition_id: geometryGateId, satisfied: true, satisfied_by_user_id: ownerId, satisfied_at: new Date().toISOString() },
    { version_id: v1Id, gate_definition_id: printabilityGateId, satisfied: true, satisfied_by_user_id: ownerId, satisfied_at: new Date().toISOString() },
    { version_id: v3Id, gate_definition_id: geometryGateId, satisfied: true, satisfied_by_user_id: memberId, satisfied_at: new Date().toISOString() },
    { version_id: v3Id, gate_definition_id: printabilityGateId, satisfied: false },
  ]);

  // Comments: mix of authors and one reply thread per version so delete
  // permissions (owner/admin delete any; member deletes only their own)
  // and the reply UI both have real data to exercise.
  const { data: c1, error: c1Error } = await supabase
    .from("comments")
    .insert({
      version_id: v1Id,
      author_user_id: ownerId,
      body: "Looks good, approved as our baseline.",
      position_x: 15,
      position_y: 10,
      position_z: 5,
    })
    .select("id")
    .single();
  if (c1Error || !c1) throw c1Error ?? new Error("Failed to create comment c1");
  await supabase.from("comments").insert({
    version_id: v1Id,
    author_user_id: memberId,
    parent_comment_id: (c1 as { id: string }).id,
    body: "Thanks for reviewing!",
    position_x: 15,
    position_y: 10,
    position_z: 5,
  });

  await supabase.from("comments").insert({
    version_id: v2Id,
    author_user_id: approverId,
    body: "Rejecting — see the reason above, thin wall near the mounting tab.",
    position_x: 15,
    position_y: 10,
    position_z: 7,
  });

  const { data: c3, error: c3Error } = await supabase
    .from("comments")
    .insert({
      version_id: v3Id,
      author_user_id: memberId,
      body: "Ready for review — thickened the tab per feedback on v2.",
      position_x: 17,
      position_y: 10,
      position_z: 7,
    })
    .select("id")
    .single();
  if (c3Error || !c3) throw c3Error ?? new Error("Failed to create comment c3");
  await supabase.from("comments").insert({
    version_id: v3Id,
    author_user_id: ownerId,
    parent_comment_id: (c3 as { id: string }).id,
    body: "Looking now.",
    position_x: 17,
    position_y: 10,
    position_z: 7,
  });

  console.log(`\nDone. Open http://localhost:5173/projects/${projectId} to inspect.`);
  console.log(`Team dashboard: http://localhost:5173/teams/${teamId}`);
  console.log(`Sign in as qa-approver@meshdiff.test or qa-member@meshdiff.test with password: ${TEST_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
