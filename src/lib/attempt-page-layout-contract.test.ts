import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("one visible attempt question keeps a labelled radio group", () => {
  const form = source("../app/exams/(attempt)/quizzes/[quizId]/attempt/AttemptForm.tsx");

  assert.match(form, /<section className="attempt-question"/);
  assert.match(form, /const currentQuestion = questions\[currentIndex\]/);
  assert.match(form, /<h2 id=\{`question-\$\{currentQuestion\.id\}-title`\}>/);
  assert.match(form, /role="radiogroup"/);
  assert.match(form, /aria-labelledby=\{`question-\$\{currentQuestion\.id\}-title`\}/);
  assert.doesNotMatch(form, /<fieldset|<legend/);
});

test("timed attempts keep the timer beside the title", () => {
  const form = source("../app/exams/(attempt)/quizzes/[quizId]/attempt/AttemptForm.tsx");
  const css = source("../app/exams/exams.css");

  assert.match(form, /attempt-form--timed/);
  assert.match(css, /\.attempt-form--timed\s*\{ padding-right: 0; \}/);
  assert.match(css, /\.attempt-timer\s*\{ position: static;/);
});

test("mobile attempts keep a compact timer and reachable navigation", () => {
  const css = source("../app/exams/exams.css");
  assert.match(css, /\.attempt-submit\s*\{ position: sticky; bottom: 0;/);
  assert.match(css, /\.attempt-navigation \.button\s*\{ min-width: 0;/);
});

test("attempt errors, previous and next live in a distinct footer and overview owns submission", () => {
  const form = source("../app/exams/(attempt)/quizzes/[quizId]/attempt/AttemptForm.tsx");
  const css = source("../app/exams/exams.css");

  assert.match(form, /<footer className="attempt-submit">[\s\S]*role="alert"[\s\S]*Previous[\s\S]*Next question[\s\S]*<\/footer>/);
  assert.match(form, /className="attempt-overview"[\s\S]*type="submit"/);
  assert.match(css, /\.attempt-submit\s*\{[^}]*border:[^}]*background:/s);
});

test("active attempts protect navigation until a successful submission disarms them", () => {
  const form = source("../app/exams/(attempt)/quizzes/[quizId]/attempt/AttemptForm.tsx");

  assert.match(form, /useAttemptNavigationProtection/);
  assert.match(form, /answersRef/);
  assert.match(form, /setNavigationActive\(false\)/);
});
