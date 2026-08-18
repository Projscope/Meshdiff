import { request, type Result } from "./projectsApi";

export interface AdminUserRow {
  id: string;
  email: string | null;
  signupDate: string;
  tier: "free" | "pro" | "team";
  status: string | null;
  currentPeriodEnd: string | null;
}

export interface AdminStats {
  totalUsers: number;
  proUsers: number;
  conversionRate: number;
  communityShares: number;
  freeShares: number;
  proShares: number;
}

export interface AdminUsersPage {
  users: AdminUserRow[];
  total: number;
  stats: AdminStats;
}

export type SignupGranularity = "week" | "month";

export interface SignupBucket {
  periodStart: string;
  count: number;
}

export interface AdminDashboard {
  stats: AdminStats;
  signups: SignupBucket[];
}

export function listAdminUsers(page = 1): Promise<Result<AdminUsersPage>> {
  return request(`/admin/users?page=${page}`);
}

export function getAdminDashboard(granularity: SignupGranularity = "week"): Promise<Result<AdminDashboard>> {
  return request(`/admin/stats?granularity=${granularity}`);
}
