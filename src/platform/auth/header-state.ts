export type HeaderAuthState = "loading" | "signed-out" | "unavailable" | "account" | "admin";

export function headerAuthState(input: {
  loading: boolean;
  hasSession: boolean;
  hasAdminPermission: boolean;
  dashboardUnavailable: boolean;
}): HeaderAuthState {
  if (input.loading) return "loading";
  if (input.hasSession) return input.hasAdminPermission ? "admin" : "account";
  return input.dashboardUnavailable ? "unavailable" : "signed-out";
}
