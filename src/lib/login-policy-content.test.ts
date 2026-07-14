import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  loginConsentMessage,
  privacyPolicyUrl,
  termsOfServiceUrl,
} from "./login-policy-content";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("consent outcomes use safe learner-facing messages", () => {
  assert.deepEqual(loginConsentMessage("consent_declined"), {
    title: "Agreement required",
    message: "You remain signed out. Accept the Terms of Service and acknowledge the Privacy Policy to continue.",
  });
  assert.deepEqual(loginConsentMessage("invalid_consent"), {
    title: "Agreement could not be completed",
    message: "This agreement request is invalid or was already used. Start a new login below.",
  });
  assert.deepEqual(loginConsentMessage("consent_expired"), {
    title: "Agreement request expired",
    message: "This agreement request has expired. Start a new login below.",
  });
  assert.equal(loginConsentMessage("provider stack trace"), undefined);
});

test("login disclosure uses the canonical policies and prospective consent wording", () => {
  assert.equal(termsOfServiceUrl, "https://atcmh.org/terms");
  assert.equal(privacyPolicyUrl, "https://atcmh.org/policy");

  const controls = source("../app/exams/AuthControls.tsx");
  assert.match(controls, /To continue, you’ll be asked to agree to the Terms of Service and acknowledge the Privacy Policy\./);
  assert.match(controls, /className="login-policy-disclosure"[^>]*>\s*To continue, you’ll be asked to agree to the <a/);
  assert.doesNotMatch(controls, /I agree to the Terms of Service and acknowledge the Privacy Policy\./);
  assert.match(controls, /termsOfServiceUrl/);
  assert.match(controls, /privacyPolicyUrl/);
});

test("footer links to both canonical policies", () => {
  const layout = source("../app/exams/layout.tsx");
  assert.match(layout, /href=\{termsOfServiceUrl\}[^>]*>Terms of Service<\/a>/);
  assert.match(layout, /href=\{privacyPolicyUrl\}[^>]*>Privacy Policy<\/a>/);
});
