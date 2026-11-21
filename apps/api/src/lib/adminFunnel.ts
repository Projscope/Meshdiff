import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "./requireAdmin.js";
import { INACTIVE_SUBSCRIPTION_STATUSES, computeTrialStatus } from "./subscription.js";

type Result<T> = { success: true; data: T } | { success: false; error: string };

// The two files the project page's "Add a sample gear" button uploads
// (SAMPLE_FILES in ProjectDetailPage.tsx). A user whose only uploads are these
// hasn't brought a model of their own.
export const SAMPLE_BUTTON_FILES = new Set(["gear-v1.stl", "gear-v2.stl"]);

const DAY_MS = 86_400_000;
const ROW_LIMIT = 200;

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** 0..1 of everyone who signed up. */
  shareOfSignups: number;
  /** 0..1 of the previous step; null for the first. */
  shareOfPrevious: number | null;
}

export type FunnelTrialState = "paying" | "trialing" | "trialing_not_started" | "ended";

export interface FunnelUserRow {
  id: string;
  email: string | null;
  signedUp: string;
  trial: FunnelTrialState;
  /** Whole days until access ends while trialing, else null. */
  daysLeft: number | null;
  uploads: number;
  /** Uploaded something, but only the sample-gear files from the button. */
  sampleOnly: boolean;
  comments: number;
  shares: number;
  paywallViews: number;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
}

export interface AdminFunnel {
  generatedAt: string;
  steps: FunnelStep[];
  paying: { count: number; shareOfSignups: number };
  /** Only counts events recorded since tracking began, so they understate
   * earlier behaviour — the UI labels them as such. */
  tracked: {
    since: string | null;
    activeLast7d: number;
    paywallViewers: number;
    sharers: number;
    proFeatureUsers: number;
  };
  rows: FunnelUserRow[];
  rowsTruncated: boolean;
}

export interface FunnelInput {
  now: number;
  /** Already excludes demo accounts and admins. */
  users: Array<{ id: string; email: string | null; createdAt: string; lastSignInAt: string | null }>;
  /** Versions in non-sample projects only. */
  versions: Array<{ id: string; userId: string | null; fileName: string; createdAt: string }>;
  comments: Array<{ versionId: string; userId: string | null; createdAt: string }>;
  events: Array<{ userId: string; event: string; createdAt: string; backfilled: boolean }>;
  lastSeenByUser: Map<string, string>;
  firstUploadByUser: Map<string, string>;
  trialExtensionByUser: Map<string, string>;
  payingIds: Set<string>;
}

function latest(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const v of values) {
    if (v && (best === null || new Date(v).getTime() > new Date(best).getTime())) best = v;
  }
  return best;
}

function step(key: string, label: string, count: number, total: number, previous: number | null): FunnelStep {
  return {
    key,
    label,
    count,
    shareOfSignups: total === 0 ? 0 : count / total,
    shareOfPrevious: previous === null ? null : previous === 0 ? 0 : count / previous,
  };
}

/** Pure: everything it needs is passed in, so it's testable without a database. */
export function buildFunnel(input: FunnelInput): AdminFunnel {
  const { now, users, payingIds } = input;
  const nonSampleVersionIds = new Set(input.versions.map((v) => v.id));

  const versionsByUser = new Map<string, FunnelInput["versions"]>();
  for (const v of input.versions) {
    if (!v.userId) continue;
    const list = versionsByUser.get(v.userId) ?? [];
    list.push(v);
    versionsByUser.set(v.userId, list);
  }
  const commentsByUser = new Map<string, FunnelInput["comments"]>();
  for (const c of input.comments) {
    if (!c.userId || !nonSampleVersionIds.has(c.versionId)) continue;
    const list = commentsByUser.get(c.userId) ?? [];
    list.push(c);
    commentsByUser.set(c.userId, list);
  }
  const eventsByUser = new Map<string, FunnelInput["events"]>();
  for (const e of input.events) {
    const list = eventsByUser.get(e.userId) ?? [];
    list.push(e);
    eventsByUser.set(e.userId, list);
  }

  const rows: FunnelUserRow[] = users.map((u) => {
    const versions = versionsByUser.get(u.id) ?? [];
    const comments = commentsByUser.get(u.id) ?? [];
    const events = eventsByUser.get(u.id) ?? [];
    const trial = computeTrialStatus(
      u.createdAt,
      input.trialExtensionByUser.get(u.id) ?? null,
      input.firstUploadByUser.get(u.id) ?? null,
      now,
    );
    const paying = payingIds.has(u.id);
    const lastSeenAt = input.lastSeenByUser.get(u.id) ?? null;
    return {
      id: u.id,
      email: u.email,
      signedUp: u.createdAt,
      trial: paying ? "paying" : !trial.isTrialing ? "ended" : trial.trialClockStarted ? "trialing" : "trialing_not_started",
      daysLeft: !paying && trial.isTrialing ? trial.trialDaysRemaining : null,
      uploads: versions.length,
      sampleOnly: versions.length > 0 && versions.every((v) => SAMPLE_BUTTON_FILES.has(v.fileName)),
      comments: comments.length,
      shares: events.filter((e) => e.event === "share_created").length,
      paywallViews: events.filter((e) => e.event === "paywall_viewed").length,
      lastSeenAt,
      lastSignInAt: u.lastSignInAt,
      lastActivityAt: latest([
        u.lastSignInAt,
        lastSeenAt,
        ...versions.map((v) => v.createdAt),
        ...comments.map((c) => c.createdAt),
        ...events.filter((e) => !e.backfilled).map((e) => e.createdAt),
      ]),
    };
  });

  // Nested so each step is a subset of the one before it.
  const uploaded = rows.filter((r) => r.uploads >= 1);
  const ownFile = uploaded.filter((r) => !r.sampleOnly);
  const twoVersions = ownFile.filter((r) => r.uploads >= 2);
  const commented = twoVersions.filter((r) => r.comments >= 1);
  const total = rows.length;
  const steps = [
    step("signed_up", "Signed up", total, total, null),
    step("uploaded", "Uploaded a model", uploaded.length, total, total),
    step("own_file", "Uploaded a file of their own", ownFile.length, total, uploaded.length),
    step("two_versions", "Uploaded 2+ versions", twoVersions.length, total, ownFile.length),
    step("commented", "Left a comment", commented.length, total, twoVersions.length),
  ];

  const payingCount = rows.filter((r) => r.trial === "paying").length;
  const userIds = new Set(users.map((u) => u.id));
  const liveEvents = input.events.filter((e) => userIds.has(e.userId));
  const distinct = (event: string) => new Set(liveEvents.filter((e) => e.event === event).map((e) => e.userId)).size;
  const sevenDaysAgo = now - 7 * DAY_MS;

  const sorted = [...rows].sort((a, b) => new Date(b.signedUp).getTime() - new Date(a.signedUp).getTime());

  return {
    generatedAt: new Date(now).toISOString(),
    steps,
    paying: { count: payingCount, shareOfSignups: total === 0 ? 0 : payingCount / total },
    tracked: {
      since: earliest([
        ...[...input.lastSeenByUser.values()],
        ...input.events.filter((e) => !e.backfilled).map((e) => e.createdAt),
      ]),
      activeLast7d: rows.filter((r) => r.lastSeenAt && new Date(r.lastSeenAt).getTime() >= sevenDaysAgo).length,
      paywallViewers: distinct("paywall_viewed"),
      sharers: distinct("share_created"),
      proFeatureUsers: distinct("first_pro_feature_used"),
    },
    rows: sorted.slice(0, ROW_LIMIT),
    rowsTruncated: sorted.length > ROW_LIMIT,
  };
}

function earliest(values: string[]): string | null {
  let best: string | null = null;
  for (const v of values) {
    if (best === null || new Date(v).getTime() < new Date(best).getTime()) best = v;
  }
  return best;
}

const PAGE = 1000;

async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  orderBy: string,
  /** Skip soft-deleted rows (tables with a deleted_at tombstone, e.g. comments). */
  liveOnly = false,
): Promise<Result<T[]>> {
  const out: T[] = [];
  for (let page = 0; page < 50; page++) {
    const base = supabase.from(table).select(columns);
    const { data, error } = await (liveOnly ? base.is("deleted_at", null) : base)
      .order(orderBy)
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { success: false, error: `${table}: ${error.message}` };
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { success: true, data: out };
}

export async function getAdminFunnel(supabase: SupabaseClient): Promise<Result<AdminFunnel>> {
  const usersResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersResult.error) return { success: false, error: "Failed to load users" };

  const [demo, projects, versions, comments, firstUploads, extensions, subs, grants, events, activity] = await Promise.all([
    fetchAll<{ user_id: string }>(supabase, "demo_accounts", "user_id", "user_id"),
    fetchAll<{ id: string; is_sample: boolean }>(supabase, "projects", "id, is_sample", "id"),
    fetchAll<{ id: string; project_id: string; file_name: string; created_at: string; uploaded_by_user_id: string | null }>(
      supabase, "versions", "id, project_id, file_name, created_at, uploaded_by_user_id", "id"),
    fetchAll<{ version_id: string; author_user_id: string | null; created_at: string }>(
      supabase, "comments", "version_id, author_user_id, created_at", "id", true),
    fetchAll<{ user_id: string; first_upload_at: string }>(supabase, "first_user_uploads", "user_id, first_upload_at", "user_id"),
    fetchAll<{ user_id: string; trial_ends_at: string }>(supabase, "trial_extensions", "user_id, trial_ends_at", "user_id"),
    fetchAll<{ user_id: string; status: string }>(supabase, "subscriptions", "user_id, status", "user_id"),
    fetchAll<{ user_id: string }>(supabase, "admin_granted_tier", "user_id", "user_id"),
    fetchAll<{ user_id: string | null; event: string; props: { backfilled?: boolean } | null; created_at: string }>(
      supabase, "product_events", "user_id, event, props, created_at", "id"),
    fetchAll<{ user_id: string; last_seen_at: string }>(supabase, "user_activity", "user_id, last_seen_at", "user_id"),
  ]);
  for (const r of [demo, projects, versions, comments, firstUploads, extensions, subs, grants]) {
    if (!r.success) return { success: false, error: r.error };
  }
  // Display-only: if the tracking tables aren't there yet, the funnel's
  // historical steps still work.
  const eventRows = events.success ? events.data : [];
  const activityRows = activity.success ? activity.data : [];
  if (!demo.success || !projects.success || !versions.success || !comments.success || !firstUploads.success ||
      !extensions.success || !subs.success || !grants.success) {
    return { success: false, error: "Failed to load funnel data" };
  }

  const demoIds = new Set(demo.data.map((d) => d.user_id));
  const sampleProjectIds = new Set(projects.data.filter((p) => p.is_sample).map((p) => p.id));
  const payingIds = new Set<string>([
    ...subs.data.filter((s) => !INACTIVE_SUBSCRIPTION_STATUSES.includes(s.status)).map((s) => s.user_id),
    ...grants.data.map((g) => g.user_id),
  ]);

  return {
    success: true,
    data: buildFunnel({
      now: Date.now(),
      users: usersResult.data.users
        .filter((u) => !demoIds.has(u.id) && !isAdminEmail(u.email))
        .map((u) => ({ id: u.id, email: u.email ?? null, createdAt: u.created_at, lastSignInAt: u.last_sign_in_at ?? null })),
      versions: versions.data
        .filter((v) => !sampleProjectIds.has(v.project_id))
        .map((v) => ({ id: v.id, userId: v.uploaded_by_user_id, fileName: v.file_name, createdAt: v.created_at })),
      comments: comments.data.map((c) => ({ versionId: c.version_id, userId: c.author_user_id, createdAt: c.created_at })),
      events: eventRows
        .filter((e): e is typeof e & { user_id: string } => e.user_id !== null)
        .map((e) => ({ userId: e.user_id, event: e.event, createdAt: e.created_at, backfilled: e.props?.backfilled === true })),
      lastSeenByUser: new Map(activityRows.map((a) => [a.user_id, a.last_seen_at])),
      firstUploadByUser: new Map(firstUploads.data.map((f) => [f.user_id, f.first_upload_at])),
      trialExtensionByUser: new Map(extensions.data.map((x) => [x.user_id, x.trial_ends_at])),
      payingIds,
    }),
  };
}
