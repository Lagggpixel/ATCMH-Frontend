"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { FlagIcon } from "@phosphor-icons/react/Flag";
import { ListBulletsIcon } from "@phosphor-icons/react/ListBullets";

import { submitLearnerAttempt } from "./actions";
import { coordinateAttemptSubmission, type AttemptQuestion } from "./attempt-form-model";
import { useAttemptNavigationProtection } from "./useAttemptNavigationProtection";
import AttemptReview from "./AttemptReview";

interface AttemptFormProps {
  quizId: string;
  quizTitle: string;
  questions: AttemptQuestion[];
  deadline: number | null;
}

export default function AttemptForm({ deadline, quizId, quizTitle, questions }: AttemptFormProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [flags, setFlags] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [navigationActive, setNavigationActive] = useState(true);
  const [error, setError] = useState<string>();
  const [secondsLeft, setSecondsLeft] = useState(() => deadline === null ? 0 : Math.max(0, deadline - Math.floor(Date.now() / 1_000)));
  const submissionStarted = useRef(false);
  const timeoutAttempted = useRef(false);
  const answersRef = useRef(answers);
  const [csrfToken, setCsrfToken] = useState<string>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const firstView = useRef(true);

  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [currentIndex, reviewOpen]);

  useEffect(() => {
    if (error && reviewOpen) errorRef.current?.focus();
  }, [error, reviewOpen]);

  useEffect(() => {
    void fetch("/exams/api/auth/session", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((body: { session?: { csrfToken?: string } | null }) => setCsrfToken(body.session?.csrfToken))
      .catch(() => setCsrfToken(undefined));
  }, []);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const submit = useCallback(async (submissionReason: "manual" | "timeout", navigateOnSuccess = true): Promise<boolean> => {
    if (submissionStarted.current || !csrfToken) return false;
    setPending(true);
    setError(undefined);

    const result = await coordinateAttemptSubmission(
      submissionStarted,
      () => submitLearnerAttempt({ quizId, answers: answersRef.current, submissionReason, csrfToken }),
    );
    if (result.status === "success") {
      setNavigationActive(false);
      if (navigateOnSuccess) router.push(`/exams/attempts/${encodeURIComponent(result.attemptId)}`);
      return true;
    }
    if (result.status === "ignored") return false;

    setPending(false);
    setError(result.message);
    setReviewOpen(true);
    return false;
  }, [csrfToken, quizId, router]);

  useAttemptNavigationProtection({
    active: navigationActive,
    quizId,
    answersRef,
    onConfirmedNavigation: () => submit("manual", false),
    csrfToken,
  });

  useEffect(() => {
    if (deadline === null || submissionStarted.current) return;

    const updateTimer = () => {
      const next = Math.max(0, deadline - Math.floor(Date.now() / 1_000));
      setSecondsLeft(next);
      if (next === 0 && !timeoutAttempted.current && csrfToken) {
        timeoutAttempted.current = true;
        void submit("timeout");
      }
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [csrfToken, deadline, submit]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reviewOpen) void submit("manual");
    else setReviewOpen(true);
  };

  const timerText = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter(question => Boolean(answers[question.id])).length;
  const openQuestion = (index: number) => {
    setCurrentIndex(index);
    setReviewOpen(false);
  };
  const reviewButton = (className: string) => <button className={`attempt-review-open ${className}`} type="button" disabled={pending} onClick={() => setReviewOpen(true)}><ListBulletsIcon size={20} aria-hidden="true"/>Review answers</button>;

  return (
    <form className={`attempt-form ${reviewOpen ? "attempt-form--review" : "attempt-form--question"}${pending ? " attempt-form--pending" : ""}`} onSubmit={handleSubmit} aria-busy={pending}>
      <header className="attempt-header">
        <div className="attempt-identity">
          <p className="eyebrow">Quiz attempt</p>
          <h1 id="page-title">{quizTitle}</h1>
        </div>
        {!reviewOpen ? <div className="attempt-progress"><strong>Question {currentIndex + 1} of {questions.length}</strong><progress value={currentIndex + 1} max={Math.max(1, questions.length)} aria-label="Quiz position"/><span>{answeredCount} answered</span></div> : null}
        {deadline !== null ? <p className="attempt-timer" role="timer" aria-live="off"><span>Time remaining</span><strong>{timerText}</strong></p> : null}
        {!reviewOpen ? reviewButton("attempt-review-open--desktop") : null}
      </header>

      {reviewOpen ? <AttemptReview questions={questions} answers={answers} flags={flags} answeredCount={answeredCount} pending={pending} csrfReady={Boolean(csrfToken)} error={error} errorRef={errorRef} headingRef={headingRef} onQuestion={openQuestion} onReturn={() => setReviewOpen(false)}/> : <div className="attempt-question-panel">
        {currentQuestion ?
          <section className="attempt-question" key={currentQuestion.id}>
            <button className="attempt-flag" type="button" aria-pressed={flags.has(currentQuestion.id)} disabled={pending} onClick={() => setFlags(current => {
              const next = new Set(current);
              if (next.has(currentQuestion.id)) next.delete(currentQuestion.id);
              else next.add(currentQuestion.id);
              return next;
            })}><FlagIcon size={20} weight={flags.has(currentQuestion.id) ? "fill" : "regular"} aria-hidden="true"/>{flags.has(currentQuestion.id) ? "Flagged" : "Flag question"}</button>
            <h2 ref={headingRef} tabIndex={-1} id={`question-${currentQuestion.id}-title`}>{currentQuestion.prompt}</h2>
            <div className="attempt-options" role="radiogroup" aria-labelledby={`question-${currentQuestion.id}-title`}>
              {currentQuestion.options.map((option) => (
                <label className="attempt-option" key={option.id}>
                  <input
                    checked={answers[currentQuestion.id] === option.id}
                    disabled={pending}
                    name={`question-${currentQuestion.id}`}
                    onChange={() => setAnswers((current) => {
                      const next = { ...current, [currentQuestion.id]: option.id };
                      answersRef.current = next;
                      return next;
                    })}
                    type="radio"
                    value={option.id}
                  />
                  <span>{option.text}</span>
                </label>
              ))}
            </div>
          </section>
        : null}

      <footer className="attempt-submit">
        <div className="attempt-submit__action attempt-navigation">
          <button className="button button--quiet" type="button" disabled={pending || currentIndex === 0} onClick={() => openQuestion(currentIndex - 1)}>Previous</button>
          <button className="button" type="button" disabled={pending} onClick={() => { if (currentIndex === questions.length - 1) setReviewOpen(true); else openQuestion(currentIndex + 1); }}>{currentIndex === questions.length - 1 ? "Review answers" : "Next question"}</button>
        </div>
        {currentIndex < questions.length - 1 ? reviewButton("attempt-review-open--mobile") : null}
      </footer>
      </div>}
    </form>
  );
}
