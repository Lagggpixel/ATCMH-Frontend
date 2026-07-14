"use client";

import { useState } from "react";
import { LoginProviderLinks } from "../../../AuthControls";

export function StartQuizButton({ quizId }: { quizId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [loginRequired, setLoginRequired] = useState(false);
  return <div className="start-quiz-control">
    <button className="button" type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError(undefined);
      try {
        const sessionResponse = await fetch("/exams/api/auth/session", { credentials: "include", cache: "no-store" });
        const body = await sessionResponse.json() as { session?: { csrfToken?: string } | null };
        if (!body.session?.csrfToken) { setLoginRequired(true); setBusy(false); return; }
        const response = await fetch(`/exams/api/quizzes/${encodeURIComponent(quizId)}/start`, {
          method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": body.session.csrfToken },
        });
        if (!response.ok) throw new Error("Unable to start this quiz");
        const result = await response.json() as { redirectTo?: string };
        if (!result.redirectTo?.startsWith("/")) throw new Error("Invalid start response");
        window.location.assign(result.redirectTo);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start this quiz"); setBusy(false); }
    }}>{busy ? "Starting…" : "Start quiz"}</button>
    {loginRequired ? <LoginProviderLinks returnTo={`/exams/quizzes/${quizId}`} /> : null}
    {error ? <small role="alert">{error}</small> : null}
  </div>;
}
