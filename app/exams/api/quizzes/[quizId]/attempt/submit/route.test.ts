import assert from "node:assert/strict";
import test from "node:test";

import { submitKeepaliveAttempt } from "./route";

const quizId = "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4";
const trustedOrigin = "https://exams.atcmh.org";

function request(body: string, contentType = "application/json", origin = "https://exams.atcmh.org") {
  return new Request(`https://exams.atcmh.org/exams/api/quizzes/${quizId}/attempt/submit`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": contentType },
    body,
  });
}

function context() {
  return { params: Promise.resolve({ quizId }) };
}

test("same-origin JSON submits answers for the route quiz rather than browser identity", async () => {
  const submissions: unknown[] = [];
  const response = await submitKeepaliveAttempt(request(JSON.stringify({ answers: { q1: "a1" }, discordId: "forged-user" })), context(), async (input) => {
    submissions.push(input);
    return { attemptId: "attempt-1" };
  }, trustedOrigin);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { attemptId: "attempt-1" });
  assert.deepEqual(submissions, [{ quizId, answers: { q1: "a1" }, submissionReason: "manual" }]);
});

test("same-origin text/plain JSON submits answers", async () => {
  const response = await submitKeepaliveAttempt(request(JSON.stringify({ answers: { q2: "a2" } }), "text/plain"), context(), async () => ({ attemptId: "attempt-1" }), trustedOrigin);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { attemptId: "attempt-1" });
});

test("malformed or structurally invalid payloads return stable bad-request JSON", async () => {
  for (const body of ["{", JSON.stringify({ answers: [] }), JSON.stringify({ answers: null })]) {
    const response = await submitKeepaliveAttempt(request(body), context(), async () => ({ attemptId: "attempt-1" }), trustedOrigin);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid submission." });
  }
});

test("an oversized UTF-8 payload is rejected before submission", async () => {
  const response = await submitKeepaliveAttempt(request(JSON.stringify({ answers: { q1: "x".repeat(65_537) } })), context(), async () => ({ attemptId: "attempt-1" }), trustedOrigin);

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Submission too large." });
});

test("a cross-origin request is rejected", async () => {
  const response = await submitKeepaliveAttempt(request(JSON.stringify({ answers: { q1: "a1" } }), "application/json", "https://attacker.example"), context(), async () => ({ attemptId: "attempt-1" }), trustedOrigin);

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Forbidden." });
});

test("missing session or start and unexpected failures return the controlled unavailable response", async () => {
  const missingSessionOrStart = await submitKeepaliveAttempt(request(JSON.stringify({ answers: { q1: "a1" } })), context(), async () => ({ error: "Unable to submit attempt." }), trustedOrigin);
  assert.equal(missingSessionOrStart.status, 503);
  assert.deepEqual(await missingSessionOrStart.json(), { error: "Unable to submit attempt." });

  const unexpectedFailure = await submitKeepaliveAttempt(request(JSON.stringify({ answers: { q1: "a1" } })), context(), async () => {
    throw new Error("database password and internal detail");
  }, trustedOrigin);
  assert.equal(unexpectedFailure.status, 503);
  assert.deepEqual(await unexpectedFailure.json(), { error: "Unable to submit attempt." });
});
