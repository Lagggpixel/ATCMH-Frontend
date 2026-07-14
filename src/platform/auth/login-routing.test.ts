import assert from "node:assert/strict";
import test from "node:test";

import { homeLoginHref, resolveHomeLoginRequest } from "./login-routing";

test("direct home login uses the Dashboard audience and returns home", () => {
  assert.deepEqual(resolveHomeLoginRequest(new URLSearchParams()), {
    application: "dashboard",
    returnTo: "/",
  });
});

test("contextual login accepts only paths owned by its application", () => {
  assert.deepEqual(resolveHomeLoginRequest(new URLSearchParams({
    loginFor: "dashboard",
    returnTo: "/dashboard/mentees?filter=open",
  })), {application: "dashboard", returnTo: "/dashboard/mentees?filter=open"});
  assert.deepEqual(resolveHomeLoginRequest(new URLSearchParams({
    loginFor: "exams",
    returnTo: "/exams/quizzes/quiz-1",
  })), {application: "exams", returnTo: "/exams/quizzes/quiz-1"});
});

test("contextual login rejects cross-application and malicious destinations", () => {
  for (const returnTo of ["https://evil.test", "//evil.test", "/dashboardish", "/dashboard/../exams", "/dashboard\\admin", "/dashboard#fragment", "/dashboard%0aevil"]) {
    assert.equal(resolveHomeLoginRequest(new URLSearchParams({loginFor: "dashboard", returnTo})).returnTo, "/");
  }
  assert.equal(resolveHomeLoginRequest(new URLSearchParams({loginFor: "exams", returnTo: "/dashboard"})).returnTo, "/exams");
});

test("home login links preserve the application and canonical return path", () => {
  assert.equal(homeLoginHref("dashboard", "/dashboard/stats"), "/?loginFor=dashboard&returnTo=%2Fdashboard%2Fstats");
  assert.equal(homeLoginHref("exams", "/exams/quizzes/quiz-1"), "/?loginFor=exams&returnTo=%2Fexams%2Fquizzes%2Fquiz-1");
});

test("compatibility links preserve only supported auth errors", () => {
  assert.equal(homeLoginHref("dashboard", "/account", "consent_expired"), "/?loginFor=dashboard&returnTo=%2Faccount&authError=consent_expired");
  assert.equal(homeLoginHref("dashboard", "/account", "stack trace <script>"), "/?loginFor=dashboard&returnTo=%2Faccount");
});
