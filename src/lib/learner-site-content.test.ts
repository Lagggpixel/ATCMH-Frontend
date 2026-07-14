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

test("learner header does not offer login to a verified session", () => {
  assert.equal(learnerAuthLabel(undefined), "Login");
  assert.equal(learnerAuthLabel("123456789012345678"), "Logged in");
});

test("home authentication UX handles central outcomes and hides provider choices when signed in", () => {
  const source = readFileSync(new URL("../../app/exams/(learner)/page.tsx", import.meta.url), "utf8");
  assert.match(source, /authError === "cancelled"/);
  assert.match(source, /authError === "provider_failure"/);
  assert.match(source, /authError === "link_conflict"/);
  assert.match(source, /!session \? <section className="content-card auth-choice"/);
});
