"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { submitLearnerAttempt } from "./actions";
import { coordinateAttemptSubmission, remainingSeconds, type AttemptQuestion } from "./attempt-form-model";
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
      if (next === 0 && !timeoutAttempted.current) {
        timeoutAttempted.current = true;
        void submit("timeout");
      }
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [deadline, submit]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit("manual");
  };

  const timerText = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <form className={`attempt-form${deadline !== null ? " attempt-form--timed" : ""}${pending ? " attempt-form--pending" : ""}`} onSubmit={handleSubmit}>
      <header className="attempt-header">
        <div>
          <p className="eyebrow">Quiz attempt</p>
          <h1 id="page-title">{quizTitle}</h1>
        </div>
        {deadline !== null ? <p className="attempt-timer" role="timer" aria-live="off"><span>Time remaining</span><strong>{timerText}</strong></p> : null}
      </header>

      <div className="attempt-questions">
        {questions.map((question, questionIndex) => (
          <section className="attempt-question" key={question.id}>
            <h2 id={`question-${question.id}-title`}><span>Question {questionIndex + 1}</span>{question.prompt}</h2>
            <div className="attempt-options" role="radiogroup" aria-labelledby={`question-${question.id}-title`}>
              {question.options.map((option) => (
                <label className="attempt-option" key={option.id}>
                  <input
                    checked={answers[question.id] === option.id}
                    disabled={pending}
                    name={`question-${question.id}`}
                    onChange={() => setAnswers((current) => {
                      const next = { ...current, [question.id]: option.id };
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
        ))}
      </div>

      <footer className="attempt-submit">
        {error ? <p className="attempt-error" role="alert">{error}</p> : null}
        <div className="attempt-submit__action">
          <button className="button" disabled={pending || !csrfToken} type="submit">{pending ? "Submitting…" : csrfToken ? "Submit quiz" : "Securing session…"}</button>
        </div>
      </footer>
    </form>
  );
}
