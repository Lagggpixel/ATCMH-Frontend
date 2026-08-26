import {ExamsApiUtils} from "@/src/dashboard/utils/ExamsApiUtils";

export type DashboardExamsBootstrapResult = "existing-session" | "anonymous";

/**
 * Reads the one ATCMH browser session shared by Dashboard and Exams.
 */
export async function bootstrapDashboardExamsSession(): Promise<DashboardExamsBootstrapResult> {
  let existingSession: Awaited<ReturnType<typeof ExamsApiUtils.getExistingSession>> = null;
  try {
    existingSession = await ExamsApiUtils.getExistingSession();
  } catch {
    return "anonymous";
  }
  return existingSession ? "existing-session" : "anonymous";
}
