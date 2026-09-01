// One-off local dev helper: drives real API calls (not raw table writes) as
// the three QA accounts created by seedApprovalTest.ts, so the notification
// and comment-lifecycle code paths added in migrations 0029/0030 get
// exercised for real rather than just seeded as static rows. Run AFTER
// seedApprovalTest.ts, with the project id it printed:
//   npx tsx scripts/seedNotificationsAndLifecycle.ts <project-id>

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_URL = process.env.API_URL ?? "http://localhost:3001";
const TEST_PASSWORD = "MeshdiffTest123!";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "password123!";

async function tokenFor(email: string, password: string): Promise<string> {
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error(`Failed to sign in as ${email}`);
  return data.session.access_token;
}

async function findUserIdByEmail(email: string): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`No user found with email ${email}`);
}

async function api(token: string, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) console.error(`  ${method} ${path} -> ${res.status}`, json);
  else console.log(`  ${method} ${path} -> ${res.status}`);
  return json;
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: npx tsx scripts/seedNotificationsAndLifecycle.ts <project-id>");
    process.exit(1);
  }

  const ownerToken = await tokenFor("jviaches@gmail.com", OWNER_PASSWORD);
  const approverToken = await tokenFor("qa-approver@meshdiff.test", TEST_PASSWORD);
  const memberToken = await tokenFor("qa-member@meshdiff.test", TEST_PASSWORD);
  const memberId = await findUserIdByEmail("qa-member@meshdiff.test");

  const versionsRes = await api(ownerToken, "GET", `/projects/${projectId}/versions`);
  const versions = versionsRes.data as Array<{ id: string; versionNumber: number; approvalStatus: string }>;
  const v3 = versions.find((v: { versionNumber: number }) => v.versionNumber === 3);
  if (!v3) throw new Error("Expected a v3 (in_review) from seedApprovalTest.ts");
  console.log(`Using v3 = ${v3.id} (status: ${v3.approvalStatus})`);

  const gatesRes = await api(ownerToken, "GET", `/projects/${projectId}/versions/${v3.id}/approval-gates`);
  const gates = gatesRes.data as Array<{ id: string; label: string; satisfied: boolean }>;
  const unmetGate = gates.find((g) => !g.satisfied);

  console.log("\n1. Member checks off the last unmet gate -> gate_completed notification to owner+approver");
  if (unmetGate) {
    await api(memberToken, "PATCH", `/projects/${projectId}/versions/${v3.id}/approval-gates/${unmetGate.id}`, {
      satisfied: true,
    });
  } else {
    console.log("  (already fully satisfied, skipping)");
  }

  console.log("\n2. Owner comments with an @mention of the approver -> mention notification");
  const mentionComment = await api(ownerToken, "POST", `/projects/${projectId}/versions/${v3.id}/comments`, {
    body: "@qa-approver@meshdiff.test can you take a look at the mounting tab before we approve this?",
    position: [10, 5, 2],
  });

  console.log("\n3. Owner comments and assigns it to the member -> comment_assigned notification");
  const assignedComment = await api(ownerToken, "POST", `/projects/${projectId}/versions/${v3.id}/comments`, {
    body: "Please double check the fillet radius here.",
    position: [12, 6, 3],
    assigneeUserId: memberId,
    priority: "high",
  });

  console.log("\n4. Member resolves their assigned comment, then owner reopens it -> comment lifecycle");
  if (assignedComment?.data?.id) {
    await api(memberToken, "PATCH", `/projects/${projectId}/versions/${v3.id}/comments/${assignedComment.data.id}`, {
      status: "resolved",
    });
    await api(ownerToken, "PATCH", `/projects/${projectId}/versions/${v3.id}/comments/${assignedComment.data.id}`, {
      status: "reopened",
    });
  }

  console.log("\n5. Approver approves v3 (now that gates are satisfied) -> version_state_changed notification to uploader");
  await api(approverToken, "POST", `/projects/${projectId}/versions/${v3.id}/approve`);

  console.log("\nDone. Sign in as jviaches@gmail.com, qa-approver@meshdiff.test, or qa-member@meshdiff.test");
  console.log("and open the Notifications bell to see what each role received.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
