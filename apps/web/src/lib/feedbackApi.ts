import { request, type Result } from "./projectsApi";

export type FeedbackType = "note" | "feature" | "bug";

export interface FeedbackEntry {
  id: string;
  type: FeedbackType;
  message: string;
  email: string | null;
  page: string | null;
  status: "new" | "reviewed";
  createdAt: string;
}

export interface AdminFeedbackPage {
  entries: FeedbackEntry[];
  total: number;
}

/** Public — no auth required. Used by the "Add Feedback" button on the
 * free, unauthenticated Live Diff tool. */
export function submitFeedback(input: {
  type: FeedbackType;
  message: string;
  email?: string;
  page?: string;
}): Promise<Result<true>> {
  return request("/feedback", { method: "POST", body: JSON.stringify(input) });
}

export function listAdminFeedback(page = 1): Promise<Result<AdminFeedbackPage>> {
  return request(`/admin/feedback?page=${page}`);
}

export function updateFeedbackStatus(id: string, status: "new" | "reviewed"): Promise<Result<true>> {
  return request(`/admin/feedback/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}
