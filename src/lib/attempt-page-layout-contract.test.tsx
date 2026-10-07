import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AttemptReview from "../app/exams/(attempt)/quizzes/[quizId]/attempt/AttemptReview";

function review(overrides: Partial<Parameters<typeof AttemptReview>[0]> = {}) {
  return renderToStaticMarkup(<AttemptReview
    questions={[
      { id: "randomized-second", prompt: "Private question text", options: [{ id: "a", text: "Answer A" }] },
      { id: "randomized-first", prompt: "Other question", options: [{ id: "b", text: "Answer B" }] },
      { id: "third", prompt: "Third question", options: [] },
    ]}
    answers={{ "randomized-second": "a" }} flags={new Set(["randomized-second", "randomized-first"])}
    answeredCount={1} pending={false} csrfReady={true} errorRef={null} headingRef={null} onQuestion={() => {}} onReturn={() => {}}
    {...overrides}
  />);
}

test("review preserves attempt order and exposes answered and flagged as independent states", () => {
  const html = review();
  const labels = [...html.matchAll(/aria-label="(Question \d+:[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(labels, ["Question 1: Answered, Flagged", "Question 2: Unanswered, Flagged", "Question 3: Unanswered"]);
  assert.equal((html.match(/class="attempt-review-tile is-flagged"/g) ?? []).length, 2);
  assert.match(html, /1 of 3 answered/);
  assert.match(html, /2 flagged/);
  assert.doesNotMatch(html, /Private question text|Answer A|correct|incorrect/i);
});

test("review owns submission, shows failures, and disables every action during submission", () => {
  const html = review({ pending: true, error: "Connection lost. Try again." });
  assert.match(html, /role="alert">Connection lost\. Try again\./);
  assert.match(html, /type="submit" disabled="">Submitting/);
  const buttons = html.match(/<button[^>]*>/g) ?? [];
  assert.equal(buttons.length, 5);
  assert.ok(buttons.every(button => button.includes('disabled=""')));
  assert.doesNotMatch(html, /radiogroup|Next question|class="attempt-question"/);
});

test("submission waits for the secured session while question return remains available", () => {
  const html = review({ csrfReady: false });
  assert.match(html, /type="submit" disabled="">Securing session/);
  assert.match(html, /class="button button--quiet" type="button">Return to question/);
});
