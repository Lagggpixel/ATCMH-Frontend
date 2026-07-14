export type HeaderAuthState = "loading" | "signed-out" | "unavailable" | "exams-only" | "account" | "admin";

export function headerAuthState(input: {
  loading: boolean;
  hasDashboardSession: boolean;
  hasAdminPermission: boolean;
  dashboardUnavailable: boolean;
  hasExamsSession: boolean;
}): HeaderAuthState {
  if (input.loading) return "loading";
  if (input.hasDashboardSession) return input.hasAdminPermission ? "admin" : "account";
  if (input.hasExamsSession) return "exams-only";
  return input.dashboardUnavailable ? "unavailable" : "signed-out";
}
