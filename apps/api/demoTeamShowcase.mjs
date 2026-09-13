import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import { loadMeshGeometryServer } from "./dist/lib/loadMeshServer.js";
import { computeVoxelDiff } from "../shared/dist/engine/diffVoxels.js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = "http://localhost:3001";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getOrCreateSession(email) {
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing.users.find((u) => u.email === email);
  if (found) await admin.auth.admin.deleteUser(found.id);

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) throw linkError;

  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: "email",
  });
  if (otpError) throw otpError;

  return { userId: otpData.user.id, accessToken: otpData.session.access_token };
}

async function api(accessToken, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function uploadVersion(accessToken, projectId, filePath, isFirstVersion, previousGeometry) {
  const buf = await readFile(filePath);
  const fileName = filePath.split(/[\\/]/).pop();
  const { versionId, uploadUrl } = await api(accessToken, "POST", `/projects/${projectId}/versions`, {
    fileName,
    fileSize: buf.byteLength,
  });

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: buf,
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (!putRes.ok) throw new Error(`upload PUT failed: ${putRes.status} ${await putRes.text()}`);

  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loaded = await loadMeshGeometryServer(ab, "stl");
  if (!loaded.success) throw new Error("failed to load mesh: " + loaded.error);

  const baseGeometry = previousGeometry ?? loaded.data;
  const diff = computeVoxelDiff(baseGeometry, loaded.data, { fileFormatA: "stl", fileFormatB: "stl" });
  if (!diff.success) throw new Error("diff failed: " + diff.error);

  await api(accessToken, "POST", `/projects/${projectId}/versions/${versionId}/finalize`, {
    stats: diff.data.stats,
  });

  return { versionId, geometry: loaded.data };
}

console.log("Creating Alex (owner) and Sarah (approver)...");
const alex = await getOrCreateSession("alex-demo@example.com");
const sarah = await getOrCreateSession("sarah-demo@example.com");
console.log("alex:", alex.userId, "sarah:", sarah.userId);

console.log("Granting Alex a Team subscription with real seats...");
const now = new Date();
const later = new Date(now.getTime() + 30 * 86400000);
const { error: subError } = await admin.from("subscriptions").upsert(
  {
    user_id: alex.userId,
    stripe_subscription_id: `sub_local_demo_${alex.userId}`,
    stripe_price_id: "price_local_demo_team",
    status: "active",
    tier: "team",
    quantity: 5,
    current_period_start: now.toISOString(),
    current_period_end: later.toISOString(),
    cancel_at_period_end: false,
  },
  { onConflict: "user_id" },
);
if (subError) throw subError;

console.log("Creating team...");
const team = await api(alex.accessToken, "POST", "/teams", { name: "Prototype Team" });
console.log("team:", team.id);

console.log("Inviting Sarah as approver...");
await api(alex.accessToken, "POST", `/teams/${team.id}/members`, { email: "sarah-demo@example.com", role: "approver" });

console.log("Creating team project...");
const project = await api(alex.accessToken, "POST", "/projects", {
  name: "Robot Housing",
  description: "Motor mount plate for the robot base — under team review.",
});
await api(alex.accessToken, "PATCH", `/projects/${project.id}`, { teamId: team.id });
console.log("project:", project.id);

console.log("Uploading v1 (Alex)...");
const v1Path = "C:/Users/Slava/AppData/Local/Temp/claude/C--Development-Meshdiff/scratchpad/motor-mount-v1.stl";
const v1 = await uploadVersion(alex.accessToken, project.id, v1Path, true, null);
console.log("v1:", v1.versionId);

console.log("Sarah requests changes on v1...");
await api(sarah.accessToken, "POST", `/projects/${project.id}/versions/${v1.versionId}/request-changes`, {
  reason: "Center bore looks too small for the specified motor shaft — please rebore before we approve.",
});

console.log("Sarah adds a pinned comment on v1...");
const comment = await api(sarah.accessToken, "POST", `/projects/${project.id}/versions/${v1.versionId}/comments`, {
  body: "This hole looks too small for the motor shaft — can we bore it out?",
  position: [0, 0, 10],
});
console.log("comment:", comment.id);

console.log("Alex replies...");
await api(alex.accessToken, "POST", `/projects/${project.id}/versions/${v1.versionId}/comments`, {
  body: "Good catch — bored it out to 16mm and reinforced the back wall in v2.",
  position: [0, 0, 10],
  parentCommentId: comment.id,
});

console.log("Uploading v2 (Alex)...");
const v2Path = "C:/Users/Slava/AppData/Local/Temp/claude/C--Development-Meshdiff/scratchpad/motor-mount-v2.stl";
const v2 = await uploadVersion(alex.accessToken, project.id, v2Path, false, v1.geometry);
console.log("v2:", v2.versionId);

console.log("Sarah approves v2...");
await api(sarah.accessToken, "POST", `/projects/${project.id}/versions/${v2.versionId}/approve`, {});

console.log("Alex resolves the comment thread...");
await api(alex.accessToken, "PATCH", `/projects/${project.id}/versions/${v1.versionId}/comments/${comment.id}`, {
  status: "resolved",
});

console.log("\nDone.");
console.log("Team:", team.id, "Project:", project.id);
console.log("Alex email: alex-demo@example.com (owner)");
console.log("Sarah email: sarah-demo@example.com (approver)");
