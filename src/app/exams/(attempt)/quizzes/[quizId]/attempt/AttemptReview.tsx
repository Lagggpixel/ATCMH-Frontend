import React, { type Ref } from "react";
import { FlagIcon } from "@phosphor-icons/react/Flag";
import { CircleIcon } from "@phosphor-icons/react/Circle";
import type { AttemptQuestion } from "./attempt-form-model";

interface AttemptReviewProps {
  questions: AttemptQuestion[];
  answers: Readonly<Record<string, string>>;
  flags: ReadonlySet<string>;
  answeredCount: number;
  pending: boolean;
  csrfReady: boolean;
  error?: string;
  errorRef: Ref<HTMLParagraphElement>;
  headingRef: Ref<HTMLHeadingElement>;
  onQuestion(index: number): void;
  onReturn(): void;
}

export default function AttemptReview({ questions, answers, flags, answeredCount, pending, csrfReady, error, errorRef, headingRef, onQuestion, onReturn }: AttemptReviewProps) {
  return <section className="attempt-overview" aria-labelledby="attempt-review-title">
    <div className="attempt-overview__heading">
      <h2 id="attempt-review-title" ref={headingRef} tabIndex={-1}>Review answers</h2>
      <p>{answeredCount} of {questions.length} answered <span aria-hidden="true">·</span> {questions.filter(question => flags.has(question.id)).length} flagged</p>
    </div>
    <div className="attempt-overview__grid">
      {questions.map((question, index) => {
        const answered = Boolean(answers[question.id]);
        const flagged = flags.has(question.id);
        const status = answered ? "Answered" : "Unanswered";
        return <button type="button" key={question.id} className={`attempt-review-tile${flagged ? " is-flagged" : ""}`} data-answered={answered} disabled={pending} aria-label={`Question ${index + 1}: ${status}${flagged ? ", Flagged" : ""}`} onClick={() => onQuestion(index)}>
          <span className="attempt-review-tile__top"><strong>{index + 1}</strong>{flagged ? <FlagIcon size={20} weight="fill" aria-hidden="true"/> : <CircleIcon size={14} weight={answered ? "fill" : "regular"} aria-hidden="true"/>}</span>
          <span className="attempt-review-tile__status">{status}</span>
          {flagged ? <span className="attempt-review-tile__flag">Flagged</span> : null}
        </button>;
      })}
    </div>
    <ul className="attempt-overview__legend" aria-label="Question statuses">
      <li><CircleIcon size={14} weight="fill" aria-hidden="true"/>Answered</li>
      <li><CircleIcon size={14} aria-hidden="true"/>Unanswered</li>
      <li><FlagIcon size={18} weight="fill" aria-hidden="true"/>Flagged</li>
    </ul>
    <footer className="attempt-submit attempt-submit--review">
      {error ? <p className="attempt-error" ref={errorRef} tabIndex={-1} role="alert">{error}</p> : null}
      <div className="attempt-submit__action attempt-navigation">
        <button className="button button--quiet" type="button" disabled={pending} onClick={onReturn}>Return to question</button>
        <button className="button" type="submit" disabled={pending || !csrfReady}>{pending ? "Submitting…" : csrfReady ? "Submit quiz" : "Securing session…"}</button>
      </div>
    </footer>
  </section>;
}
