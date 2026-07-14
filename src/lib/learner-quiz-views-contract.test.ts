import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { StartQuizButton } from "../app/exams/(learner)/quizzes/[quizId]/StartQuizButton";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("catalogue renders accessible linked cards with category and description", () => {
  const page = source("../app/exams/(learner)/quizzes/page.tsx");

  assert.match(page, /className="quiz-card-grid"/);
  assert.match(page, /className="quiz-card"/);
  assert.match(page, /<Link className="quiz-card__link" href=\{`\/exams\/quizzes\/\$\{quiz\.id\}`\}>/);
  assert.match(page, /className="quiz-card__category"[^>]*>\{quiz\.category\}/);
  assert.match(page, /className="quiz-card__description"[^>]*>\{quiz\.description\}/);
});

test("catalogue visibility metadata is restricted to trusted staff access", () => {
  const page = source("../app/exams/(learner)/quizzes/page.tsx");

  assert.match(page, /const showVisibility = access\?\.canAccessPrivateQuizzes === true/);
  assert.match(page, /\{showVisibility \? \(/);
  assert.match(page, /quiz\.isPrivate \? "Private" : "Public"/);
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

test("every learner login entry keeps both providers available", () => {
  const controls = source("../app/exams/AuthControls.tsx");
  const home = source("../app/exams/(learner)/page.tsx");
  const catalogue = source("../app/exams/(learner)/quizzes/page.tsx");
  const detail = source("../app/exams/(learner)/quizzes/[quizId]/page.tsx");
  const start = source("../app/exams/(learner)/quizzes/[quizId]/StartQuizButton.tsx");

  assert.match(controls, /provider=discord/);
  assert.match(controls, /provider=ifc/);
  for (const entry of [home, catalogue, detail, start]) {
    assert.match(entry, /LoginProviderLinks/);
  }
});

test("quiz start control uses a block wrapper that can contain login choices", () => {
  const markup = renderToStaticMarkup(createElement(StartQuizButton, { quizId: "quiz-123" }));

  assert.match(markup, /^<div class="start-quiz-control">/);
  assert.doesNotMatch(markup, /^<span>/);
});

test("quiz card and detail styles include responsive and keyboard focus contracts", () => {
  const css = source("../app/exams/exams.css");

  assert.match(css, /\.quiz-card-grid\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /\.quiz-card__link:focus-visible\s*\{[^}]*outline:/s);
  assert.match(css, /\.quiz-detail-card\s*\{[^}]*text-align:\s*center/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.quiz-card-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.quiz-detail-card__actions\s*\{[^}]*align-items:\s*stretch/s);
});
