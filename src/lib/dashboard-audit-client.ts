import { createHash } from "node:crypto";

export interface DashboardAuditEvent {
  action: `exam.${string}`;
  actorId?: string;
  actorName?: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  details?: Record<string, string | number | boolean | null>;
}

interface AuditEnvironment {
  EXAMS_AUDIT_INGEST_URL?: string;
  EXAMS_AUDIT_INGEST_KEY?: string;
}
type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function auditEventId(action: string, targetId: string | undefined): string {
  const bytes = createHash("sha256").update(`${action}:${targetId ?? ""}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Best-effort learner audit delivery. A saved attempt must never be lost because
 * the Dashboard service is temporarily unavailable; deterministic IDs allow a
 * later retry to be safely deduplicated by Dashboard-Backend.
 */
export async function emitDashboardAuditEvent(
  event: DashboardAuditEvent,
  env: AuditEnvironment = {
    EXAMS_AUDIT_INGEST_URL: process.env.EXAMS_AUDIT_INGEST_URL,
    EXAMS_AUDIT_INGEST_KEY: process.env.EXAMS_AUDIT_INGEST_KEY,
  },
  fetchImpl: Fetch = fetch,
): Promise<boolean> {
  const baseUrl = env.EXAMS_AUDIT_INGEST_URL?.trim();
  const key = env.EXAMS_AUDIT_INGEST_KEY?.trim();
  if (!baseUrl || !key) return false;

  try {
    const response = await fetchImpl(new URL("internal/audit-logs/exams", `${baseUrl.replace(/\/$/, "")}/`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Exams-Audit-Key": key,
      },
      body: JSON.stringify({ ...event, eventId: auditEventId(event.action, event.targetId) }),
    });
    return response.status === 201 || response.status === 409;
  } catch {
    return false;
  }
}
