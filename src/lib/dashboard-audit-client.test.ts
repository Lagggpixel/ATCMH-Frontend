import assert from "node:assert/strict";
import test from "node:test";

import { auditEventId, emitDashboardAuditEvent } from "./dashboard-audit-client";

const event = {
  action: "exam.attempt.submitted",
  actorId: "123456789012345678",
  targetType: "attempt",
  targetId: "6c49cc19-7714-421a-9d95-0dc7be32e782",
  summary: "Learner submitted a quiz attempt.",
  details: { quizId: "8d1b564e-1f89-4550-a7dd-e6e8cb32b820", score: 8, total: 10, percentage: 80, submissionReason: "manual" },
};

test("sends a non-sensitive Exams event to the configured Dashboard ingest endpoint", async () => {
  let request: Request | undefined;
  const delivered = await emitDashboardAuditEvent(event, {
    EXAMS_AUDIT_INGEST_URL: "https://dashboard.example/",
    EXAMS_AUDIT_INGEST_KEY: "audit-secret",
  }, async (input, init) => {
    request = new Request(input, init);
    return new Response(null, { status: 201 });
  });

  assert.equal(delivered, true);
  assert.equal(request?.url, "https://dashboard.example/internal/audit-logs/exams");
  assert.equal(request?.headers.get("X-Exams-Audit-Key"), "audit-secret");
  assert.deepEqual(await request?.json(), {
    ...event,
    eventId: auditEventId(event.action, event.targetId),
  });
});

test("treats a duplicate event as delivered and skips unconfigured delivery", async () => {
  const duplicate = await emitDashboardAuditEvent(event, {
    EXAMS_AUDIT_INGEST_URL: "https://dashboard.example",
    EXAMS_AUDIT_INGEST_KEY: "audit-secret",
  }, async () => new Response(null, { status: 409 }));
  assert.equal(duplicate, true);

  const missingConfiguration = await emitDashboardAuditEvent(event, {}, async () => {
    throw new Error("must not fetch");
  });
  assert.equal(missingConfiguration, false);
});

test("uses stable UUID event IDs without retaining answer data", () => {
  assert.equal(auditEventId(event.action, event.targetId), auditEventId(event.action, event.targetId));
  assert.match(auditEventId(event.action, event.targetId), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(JSON.stringify(event).includes("answers"), false);
});
