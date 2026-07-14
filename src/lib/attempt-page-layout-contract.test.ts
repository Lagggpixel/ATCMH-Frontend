import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("attempt questions use unified cards with labelled radio groups", () => {
  const form = source("../../app/exams/(learner)/quizzes/[quizId]/attempt/AttemptForm.tsx");

  assert.match(form, /<section className="attempt-question"/);
  assert.match(form, /<h2 id=\{`question-\$\{question\.id\}-title`\}>/);
  assert.match(form, /role="radiogroup"/);
  assert.match(form, /aria-labelledby=\{`question-\$\{question\.id\}-title`\}/);
  assert.doesNotMatch(form, /<fieldset|<legend/);
});

test("timed attempts reserve a desktop rail for the fixed timer", () => {
  const form = source("../../app/exams/(learner)/quizzes/[quizId]/attempt/AttemptForm.tsx");
  const css = source("../../app/exams/exams.css");

  assert.match(form, /attempt-form--timed/);
  assert.match(css, /\.attempt-form--timed\s*\{[^}]*padding-right:/s);
  assert.match(css, /\.attempt-timer\s*\{[^}]*position:\s*fixed[^}]*top:[^}]*right:/s);
});

test("mobile attempts keep a compact top-right timer with matching clearance", () => {
  const css = source("../../app/exams/exams.css");
  const mobile = css.match(/@media \(max-width: 640px\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? "";

  assert.match(mobile, /\.attempt-form--timed\s*\{[^}]*padding-top:[^}]*padding-right:\s*0/s);
  assert.match(mobile, /\.attempt-timer\s*\{[^}]*top:[^}]*right:[^}]*width:\s*auto/s);
});

test("attempt errors and action live in a distinct submission footer", () => {
  const form = source("../../app/exams/(learner)/quizzes/[quizId]/attempt/AttemptForm.tsx");
  const css = source("../../app/exams/exams.css");

  assert.match(form, /<footer className="attempt-submit">[\s\S]*role="alert"[\s\S]*type="submit"[\s\S]*<\/footer>/);
  assert.match(css, /\.attempt-submit\s*\{[^}]*border:[^}]*background:/s);
});

test("active attempts protect navigation until a successful submission disarms them", () => {
  const form = source("../../app/exams/(learner)/quizzes/[quizId]/attempt/AttemptForm.tsx");

  assert.match(form, /useAttemptNavigationProtection/);
  assert.match(form, /answersRef/);
  assert.match(form, /setNavigationActive\(false\)/);
});
