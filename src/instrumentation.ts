export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startDashboardAuditOutboxWorker } = await import("./lib/dashboard-audit-outbox");
    startDashboardAuditOutboxWorker();
  }
}
