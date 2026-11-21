import Fastify, { type FastifyInstance } from "fastify";
import { FakeSupabase } from "./fakeSupabase";

export const OWNER = "user-owner";
export const MEMBER = "user-member";
export const OUTSIDER = "user-outsider";
export const TEAM_ID = "team-1";
export const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

export const authHeader = (userId: string) => ({ authorization: `Bearer user:${userId}` });

export function validStats(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    approxVolumeDeltaMm3: -250.4,
    approxVolumeDeltaPercent: -3.1,
    boundingBoxDeltaX: 0,
    boundingBoxDeltaY: 1.5,
    boundingBoxDeltaZ: 0,
    triangleDeltaB: 12000,
    printabilityStatus: "warn",
    printabilityIssues: ["thin_wall"],
    ...overrides,
  };
}

/** A paying Team owner. */
export function giveTeamPlan(db: FakeSupabase, userId: string): void {
  db.seed("subscriptions", {
    user_id: userId,
    tier: "team",
    status: "active",
    quantity: 5,
    current_period_end: "2099-01-01T00:00:00Z",
    cancel_at_period_end: false,
  });
}

/** A paying Pro (not Team) user. */
export function givePro(db: FakeSupabase, userId: string): void {
  db.seed("subscriptions", {
    user_id: userId,
    tier: "pro",
    status: "active",
    quantity: 1,
    current_period_end: "2099-01-01T00:00:00Z",
    cancel_at_period_end: false,
  });
}

/**
 * A project owned by OWNER with a team, three users, and the has_active_team_access
 * rule from migration 0017 (a member counts when the team owner has an active Team
 * subscription).
 */
export function seedTeamProject(db: FakeSupabase): void {
  for (const id of [OWNER, MEMBER, OUTSIDER]) db.addUser(id);
  db.seed("projects", { id: PROJECT_ID, owner_user_id: OWNER, team_id: TEAM_ID, is_sample: false, name: "Bracket" });
  db.seed("team_members", { team_id: TEAM_ID, user_id: MEMBER, role: "member" });
  db.rpcs.has_active_team_access = ({ p_user_id }) => {
    const member = db.rows("team_members").find((m) => m.user_id === p_user_id);
    if (!member) return { data: false };
    const team = { owner: OWNER };
    const sub = db.rows("subscriptions").find((s) => s.user_id === team.owner);
    return { data: !!sub && sub.tier === "team" && !["canceled", "past_due"].includes(String(sub.status)) };
  };
  db.rpcs.get_user_emails_by_ids = ({ p_ids }) => ({
    data: (p_ids as string[]).map((id) => ({ id, email: `${id}@example.test` })),
  });
  db.rpcs.get_user_id_by_email = () => ({ data: null });
}

/** Mirrors create_local_version() in migration 0042 closely enough for route tests
 * (the SQL itself is exercised against real Postgres in migration0042.test.ts). */
export function registerCreateLocalVersion(db: FakeSupabase): void {
  db.rpcs.create_local_version = (args) => {
    const existing = db.rows("versions").find((v) => v.id === args.p_id);
    if (existing) {
      if (
        existing.project_id === args.p_project_id &&
        existing.storage_mode === "local" &&
        existing.content_sha256 === args.p_content_sha256
      ) {
        return { data: existing };
      }
      return { data: null, error: { message: "version_id_conflict", code: "23505" } };
    }
    const numbers = db.rows("versions").filter((v) => v.project_id === args.p_project_id).map((v) => Number(v.version_number));
    const row = {
      id: args.p_id,
      project_id: args.p_project_id,
      version_number: Math.max(0, ...numbers) + 1,
      file_name: args.p_file_name,
      file_path: null,
      file_format: args.p_file_format,
      file_size_bytes: args.p_file_size_bytes,
      uploaded_by_user_id: args.p_uploaded_by_user_id,
      storage_mode: "local",
      content_sha256: args.p_content_sha256,
      triangle_count: null,
      change_summary: null,
      printability_status: null,
      approval_status: "pending",
    };
    db.rows("versions").push(row);
    return { data: row };
  };
}

export async function buildApp(register: Array<(app: FastifyInstance) => Promise<void>>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  for (const plugin of register) await app.register(plugin);
  await app.ready();
  return app;
}
