import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { StartQuizButton } from "../app/exams/(learner)/quizzes/[quizId]/StartQuizButton";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("catalogue renders accessible linked rows with category and description", () => {
  const catalogue = source("../app/exams/(learner)/QuizCatalogue.tsx");

  assert.match(catalogue, /className="exam-quiz-list"/);
  assert.match(catalogue, /className="exam-quiz-row"/);
  assert.match(catalogue, /<Link className="exam-quiz-row__action" href=\{`\/exams\/quizzes\/\$\{quiz\.id\}`\}>View quiz<\/Link>/);
  assert.match(catalogue, /className="exam-quiz-row__category">\{quiz\.category\}/);
  assert.match(catalogue, /<h3>\{quiz\.title\}<\/h3>/);
  assert.match(catalogue, /<p>\{quiz\.description\}<\/p>/);
  assert.match(catalogue, /type="search"/);
  assert.match(catalogue, /<select value=\{category\}/);
});

test("catalogue visibility metadata is restricted to trusted staff access", () => {
  const page = source("../app/exams/(learner)/page.tsx");
  const catalogue = source("../app/exams/(learner)/QuizCatalogue.tsx");

  assert.match(page, /showVisibility: access\?\.canAccessPrivateQuizzes === true/);
  assert.match(catalogue, /\{showVisibility \? <span>/);
  assert.match(catalogue, /quiz\.isPrivate \? "Private" : "Public"/);
  assert.doesNotMatch(page, /searchParams.*(?:role|staff|admin)/i);
});

test("quiz detail uses the centered site shell and content card", () => {
  const page = source("../app/exams/(learner)/quizzes/[quizId]/page.tsx");

  assert.match(page, /<main className="learner-main">/);
  assert.match(page, /className="site-shell quiz-detail-page"/);
  assert.match(page, /className="content-card quiz-detail-card"/);
  assert.match(page, /className="quiz-detail-card__description"/);
  assert.match(page, /className="quiz-detail-card__time"/);
  assert.match(page, /className="quiz-detail-card__actions"/);
});

test("learner pages contain no login controls and protected starts use the home modal", () => {
  const home = source("../app/exams/(learner)/page.tsx");
  const catalogue = source("../app/exams/(learner)/QuizCatalogue.tsx");
  const detail = source("../app/exams/(learner)/quizzes/[quizId]/page.tsx");
  const start = source("../app/exams/(learner)/quizzes/[quizId]/StartQuizButton.tsx");

  for (const entry of [home, catalogue, detail]) assert.doesNotMatch(entry, /LoginProviderLinks|Continue with Discord|Continue with Infinite Flight/);
  assert.match(start, /homeLoginHref\("exams"/);
  assert.doesNotMatch(start, /LoginProviderLinks|Continue with Discord|Continue with Infinite Flight/);
});

test("quiz start control uses a block wrapper that can contain login choices", () => {
  const markup = renderToStaticMarkup(createElement(StartQuizButton, { quizId: "quiz-123" }));

  assert.match(markup, /^<div class="start-quiz-control">/);
  assert.doesNotMatch(markup, /^<span>/);
});

test("quiz row and detail styles include responsive and keyboard focus contracts", () => {
  const css = source("../app/exams/exams.css");

  assert.match(css, /\.exam-quiz-row\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /\.exam-quiz-row__action:focus-visible\s*\{[^}]*outline:/s);
  assert.match(css, /\.quiz-detail-card\s*\{[^}]*text-align:\s*center/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.exam-quiz-row\s*\{[^}]*grid-template-columns:\s*1fr auto/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.quiz-detail-card__actions\s*\{[^}]*align-items:\s*stretch/s);
});
