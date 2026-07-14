import {ApiUtils} from "@/src/dashboard/utils/ApiUtils";
import {ExamsApiUtils} from "@/src/dashboard/utils/ExamsApiUtils";

export type DashboardExamsBootstrapResult = "existing-exams-session" | "anonymous" | "bridged";

/**
 * Creates an Exams session only for a browser that has an active Dashboard
 * session. The Exams cookie remains scoped to this app and is issued only by
 * the one-use handoff callback.
 */
export async function bootstrapDashboardExamsSession(): Promise<DashboardExamsBootstrapResult> {
  let existingSession: Awaited<ReturnType<typeof ExamsApiUtils.getExistingSession>> = null;
  let sessionProbeError: unknown;
  try {
    existingSession = await ExamsApiUtils.getExistingSession();
  } catch (reason) {
    sessionProbeError = reason;
  }
  if (existingSession) return "existing-exams-session";

  let dashboardSession = null;
  try {
    dashboardSession = await ApiUtils.getAuthSession();
  } catch {
    // An anonymous visitor should not see an Exams error merely because the
    // optional Dashboard session check could not complete.
    return "anonymous";
  }
  if (!dashboardSession) return "anonymous";
  if (sessionProbeError) throw sessionProbeError;

  await ExamsApiUtils.bootstrapSession(dashboardSession.csrfToken);
  return "bridged";
}
