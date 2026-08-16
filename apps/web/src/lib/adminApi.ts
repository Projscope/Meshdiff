import { request, type Result } from "./projectsApi";

export interface AdminUserRow {
  id: string;
  email: string | null;
  signupDate: string;
  tier: "free" | "pro";
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

export function listAdminUsers(page = 1): Promise<Result<AdminUsersPage>> {
  return request(`/admin/users?page=${page}`);
}
