import assert from "node:assert/strict";
import test from "node:test";

import { corsPreflight, withManagementCors } from "./management-cors";

test("allows Dashboard's authorized cross-origin requests without wildcard CORS", () => {
  const request = new Request("https://exams.atcmh.org/exams/api/management/me", {
    headers: { origin: "https://dashboard.atcmh.org" },
  });
  const response = withManagementCors(request, new Response("ok"));
  assert.equal(response.headers.get("access-control-allow-origin"), "https://dashboard.atcmh.org");
  assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type, X-CSRF-Token");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.notEqual(response.headers.get("access-control-allow-origin"), "*");
});

test("rejects untrusted CORS preflight origins", () => {
  const request = new Request("https://exams.atcmh.org/exams/api/management/me", {
    method: "OPTIONS", headers: { origin: "https://evil.example" },
  });
  assert.equal(corsPreflight(request).status, 403);
});

test("accepts Dashboard write preflights including DELETE and rejects unsupported methods", () => {
  const putRequest = new Request("https://exams.atcmh.org/exams/api/management/website", {
    method: "OPTIONS",
    headers: { origin: "https://dashboard.atcmh.org", "access-control-request-method": "PUT" },
  });
  const deleteRequest = new Request("https://exams.atcmh.org/exams/api/management/exams/attempts/attempt-id", {
    method: "OPTIONS",
    headers: { origin: "https://dashboard.atcmh.org", "access-control-request-method": "DELETE" },
  });
  const unsupportedRequest = new Request("https://exams.atcmh.org/exams/api/management/website", {
    method: "OPTIONS",
    headers: { origin: "https://dashboard.atcmh.org", "access-control-request-method": "TRACE" },
  });
  const patchRequest = new Request("https://exams.atcmh.org/exams/api/management/exams/quizzes/quiz-id/category", {
    method: "OPTIONS",
    headers: { origin: "https://dashboard.atcmh.org", "access-control-request-method": "PATCH" },
  });

  const response = corsPreflight(putRequest);
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /PUT/);
  const deleteResponse = corsPreflight(deleteRequest);
  assert.equal(deleteResponse.status, 204);
  assert.match(deleteResponse.headers.get("access-control-allow-methods") ?? "", /DELETE/);
  assert.equal(corsPreflight(patchRequest).status, 204);
  assert.match(corsPreflight(patchRequest).headers.get("access-control-allow-methods") ?? "", /PATCH/);
  assert.equal(corsPreflight(unsupportedRequest).status, 405);
});
