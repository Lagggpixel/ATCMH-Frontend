import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("signed-in catalogue resolves trusted learner access and uses role-neutral empty copy", () => {
  const page = source("../app/exams/(learner)/page.tsx");
  const catalogue = source("../app/exams/(learner)/QuizCatalogue.tsx");
  assert.match(page, /resolveLearnerAccess\(discordId\)/);
  assert.match(page, /listEligibleQuizzes\(access\)/);
  assert.doesNotMatch(page, /searchParams.*(?:role|staff|admin)/i);
  assert.match(catalogue, /No quizzes are available right now\./);
  assert.doesNotMatch(catalogue, /No public quizzes are available right now\./);
});

for (const [name, relativePath] of [
  ["detail", "../app/exams/(learner)/quizzes/[quizId]/page.tsx"],
  ["attempt render", "../app/exams/(learner)/quizzes/[quizId]/attempt/page.tsx"],
  ["start", "../app/exams/api/quizzes/[quizId]/start/route.ts"],
] as const) {
  test(`${name} resolves trusted learner access before canonical quiz authorization`, () => {
    const boundary = source(relativePath);
    assert.match(boundary, /resolveLearnerAccess\(identity\.discordId\)/);
    assert.match(boundary, /getQuizForLearner\(quizId, access\)/);
    assert.doesNotMatch(boundary, /searchParams.*(?:role|staff|admin)|formData.*(?:role|staff|admin)/i);
  });
}
