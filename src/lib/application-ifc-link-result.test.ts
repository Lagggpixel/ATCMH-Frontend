import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import test from "node:test";

import {applicationIfcLinkOutcomes, readApplicationIfcLinkResult} from "./application-ifc-link-result";

const secret = "result-signing-secret-with-at-least-32-bytes";
const now = 1_785_196_800;

function token(claims: Record<string, unknown>, signingSecret = secret) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", signingSecret)
    .update(`atcmh:application-ifc-result:v1:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

const claims = (outcome: string, extra: Record<string, unknown> = {}) => ({
  v: 1,
  outcome,
  issuedAt: now,
  expiresAt: now + 600,
  ...extra,
});
test("every signed backend outcome is accepted without reflecting provider details", () => {
  for (const outcome of applicationIfcLinkOutcomes) {
    const result = readApplicationIfcLinkResult(secret, token(claims(outcome, {
      attemptId: "42",
      ...(outcome === "linked" ? {applicationType: "mentor"} : {}),
    })), now + 1);
    assert.equal(result?.outcome, outcome);
    assert.equal(result?.attemptReference, "application-ifc-oauth:42");
    assert.equal(result?.applicationType, outcome === "linked" ? "mentor" : undefined);
  }
});

test("tampered, expired, oversized, and malformed result tokens fail closed", () => {
  const valid = token(claims("provider_failure", {attemptId: "42"}));
  for (const unsafe of [
    `${valid}x`,
    token(claims("provider_failure"), "wrong-secret-with-at-least-thirty-two-bytes"),
    token({...claims("provider_failure"), expiresAt: now}),
    token({...claims("provider_failure"), expiresAt: now + 601}),
    token({...claims("provider_failure"), issuedAt: now + 61}),
    token(claims("raw-provider-error")),
    token(claims("provider_failure", {providerError: "sensitive"})),
    token(claims("linked")),
    token(claims("provider_failure", {applicationType: "mentor"})),
    token(claims("provider_failure", {attemptId: "../../../state"})),
    "x".repeat(2049),
    "not-a-token",
  ]) assert.equal(readApplicationIfcLinkResult(secret, unsafe, now), undefined);
});

test("the verifier requires a server-only purpose-specific secret", () => {
  const valid = token(claims("invalid_attempt"));
  assert.equal(readApplicationIfcLinkResult(undefined, valid, now), undefined);
  assert.equal(readApplicationIfcLinkResult("short", valid, now), undefined);
});
