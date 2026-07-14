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

  const controls = source("../platform/auth/HomeLoginModal.tsx");
  assert.match(controls, /Before access is granted, you will need to agree to the/);
  assert.match(controls, /className="login-modal-policy"/);
  assert.match(controls, /termsOfServiceUrl/);
  assert.match(controls, /privacyPolicyUrl/);
});

test("footer links to both canonical policies", () => {
  const layout = source("../marketing/SiteFooter.tsx");
  assert.match(layout, /href="\/terms">Terms of Service<\/Link>/);
  assert.match(layout, /href="\/policy">Privacy Policy<\/Link>/);
});
