"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { submitLearnerAttempt } from "./actions";
import { coordinateAttemptSubmission, type AttemptQuestion } from "./attempt-form-model";
import { useAttemptNavigationProtection } from "./useAttemptNavigationProtection";

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
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [navigationActive, setNavigationActive] = useState(true);
  const [error, setError] = useState<string>();
  const [secondsLeft, setSecondsLeft] = useState(() => deadline === null ? 0 : Math.max(0, deadline - Math.floor(Date.now() / 1_000)));
  const submissionStarted = useRef(false);
  const timeoutAttempted = useRef(false);
  const answersRef = useRef(answers);
  const [csrfToken, setCsrfToken] = useState<string>();

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
    void submit("manual");
  };

  const timerText = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter(question => Boolean(answers[question.id])).length;

  return (
    <form className={`attempt-form${deadline !== null ? " attempt-form--timed" : ""}${pending ? " attempt-form--pending" : ""}`} onSubmit={handleSubmit}>
      <header className="attempt-header">
        <div>
          <p className="eyebrow">Quiz attempt</p>
          <h1 id="page-title">{quizTitle}</h1>
        </div>
        {deadline !== null ? <p className="attempt-timer" role="timer" aria-live="off"><span>Time remaining</span><strong>{timerText}</strong></p> : null}
      </header>

      <div className="attempt-progress"><div><strong>Question {currentIndex + 1} of {questions.length}</strong><span>{answeredCount} answered</span></div><progress value={currentIndex + 1} max={questions.length} aria-label="Quiz position"/></div>

      {currentQuestion ? <div className="attempt-questions">
          <section className="attempt-question" key={currentQuestion.id}>
            <h2 id={`question-${currentQuestion.id}-title`}>{currentQuestion.prompt}</h2>
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
      </div> : null}

      <footer className="attempt-submit">
        {error ? <p className="attempt-error" role="alert">{error}</p> : null}
        <div className="attempt-submit__action attempt-navigation">
          <button className="button button--quiet" type="button" disabled={pending || currentIndex === 0} onClick={() => { setCurrentIndex(index => index - 1); setOverviewOpen(false); }}>Previous</button>
          <button className="button" type="button" disabled={pending} onClick={() => { if (currentIndex === questions.length - 1) setOverviewOpen(true); else setCurrentIndex(index => index + 1); }}>{currentIndex === questions.length - 1 ? "Review answers" : "Next question"}</button>
        </div>
        <button className="attempt-overview-toggle" type="button" aria-expanded={overviewOpen} aria-controls="attempt-overview" onClick={() => setOverviewOpen(open => !open)}>{overviewOpen ? "Hide all questions" : "View all questions"}</button>
      </footer>
      {overviewOpen ? <section className="attempt-overview" id="attempt-overview" aria-label="Answer overview"><div><h2>Answer overview</h2><p>{answeredCount} of {questions.length} answered. You can return to any question before submitting.</p></div><div className="attempt-overview__grid">{questions.map((question, index) => <button type="button" key={question.id} className={index === currentIndex ? "is-current" : ""} onClick={() => { setCurrentIndex(index); setOverviewOpen(false); }}><span>Question {index + 1}</span><small>{answers[question.id] ? "Answered" : "Unanswered"}</small></button>)}</div><button className="button attempt-overview__submit" type="submit" disabled={pending || !csrfToken}>{pending ? "Submitting…" : csrfToken ? "Submit quiz" : "Securing session…"}</button></section> : null}
    </form>
  );
}
