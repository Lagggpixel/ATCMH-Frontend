import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { learnerAuthLabel, homeStats, mentorshipSteps, quizCatalogueTitle, siteNavigation } from "./learner-site-content";

test("learner site content preserves the live navigation and homepage copy", () => {
  assert.deepEqual(siteNavigation, [
    { href: "/", label: "Home" },
    { href: "/exams/quizzes", label: "Quizzes" },
  ]);
  assert.deepEqual(homeStats, [
    { label: "Published Quizzes", value: "24" },
    { label: "Learning Pages", value: "0" },
    { label: "Current Notices", value: "1" },
  ]);
  assert.equal(mentorshipSteps[0]?.title, "Apply to IFATC");
  assert.equal(mentorshipSteps[3]?.title, "IFATC!");
  assert.equal(quizCatalogueTitle, "Quizzes");
});

test("legacy learner auth labels remain stable for session summaries", () => {
  assert.equal(learnerAuthLabel(undefined), "Login");
  assert.equal(learnerAuthLabel("123456789012345678"), "Logged in");
});

test("Exam Center landing contains no inline authentication UI", () => {
  const source = readFileSync(new URL("../app/exams/(learner)/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /LoginProviderLinks|auth-choice|Continue with Discord|Continue with Infinite Flight/);
});
