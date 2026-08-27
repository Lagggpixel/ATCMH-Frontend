import { createHash } from "node:crypto";

export interface DashboardAuditEvent {
  eventId?: string;
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

export interface AuditDeliveryWarning {
  eventId: string;
  action: string;
  targetId?: string;
  reason: "missing_configuration" | "request_failed" | "unexpected_status";
  status?: number;
}

interface AuditDeliveryOptions {
  timeoutMs?: number;
  warn?: (message: string, context: AuditDeliveryWarning) => void;
}

const defaultAuditTimeoutMs = 2_000;

export function auditEventId(action: string, targetId: string | undefined): string {
  const bytes = createHash("sha256").update(`${action}:${targetId ?? ""}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Best-effort audit delivery. A completed Exams write must never be reported as
 * failed because Dashboard is temporarily unavailable. Callers may provide an
 * operation-specific ID; one-shot learner events retain deterministic IDs.
 */
export async function emitDashboardAuditEvent(
  event: DashboardAuditEvent,
  env: AuditEnvironment = {
    EXAMS_AUDIT_INGEST_URL: process.env.EXAMS_AUDIT_INGEST_URL,
    EXAMS_AUDIT_INGEST_KEY: process.env.EXAMS_AUDIT_INGEST_KEY,
  },
  fetchImpl: Fetch = fetch,
  options: AuditDeliveryOptions = {},
): Promise<boolean> {
  const baseUrl = env.EXAMS_AUDIT_INGEST_URL?.trim();
  const key = env.EXAMS_AUDIT_INGEST_KEY?.trim();
  const resolvedEventId = event.eventId ?? auditEventId(event.action, event.targetId);
  const warn = options.warn ?? ((message: string, context: AuditDeliveryWarning) => console.warn(message, context));
  const warningContext = (reason: AuditDeliveryWarning["reason"], status?: number): AuditDeliveryWarning => ({
    eventId: resolvedEventId,
    action: event.action,
    ...(event.targetId ? {targetId: event.targetId} : {}),
    reason,
    ...(status === undefined ? {} : {status}),
  });
  if (!baseUrl || !key) {
    warn("Dashboard audit delivery skipped", warningContext("missing_configuration"));
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? defaultAuditTimeoutMs);
  try {
    const payload = {...event};
    delete payload.eventId;
    const response = await fetchImpl(new URL("internal/audit-logs/exams", `${baseUrl.replace(/\/$/, "")}/`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Exams-Audit-Key": key,
      },
      body: JSON.stringify({ ...payload, eventId: resolvedEventId }),
      signal: controller.signal,
    });
    const delivered = response.status === 201 || response.status === 409;
    if (!delivered) warn("Dashboard audit delivery failed", warningContext("unexpected_status", response.status));
    return delivered;
  } catch {
    warn("Dashboard audit delivery failed", warningContext("request_failed"));
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
