"use client";

import { useState } from "react";
import {homeLoginHref} from "@/src/platform/auth/login-routing";

export function StartQuizButton({ quizId }: { quizId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return <div className="start-quiz-control">
    <button className="button" type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError(undefined);
      try {
        const sessionResponse = await fetch("/exams/api/auth/session", { credentials: "include", cache: "no-store" });
        const body = await sessionResponse.json() as { session?: { csrfToken?: string } | null };
        if (!body.session?.csrfToken) { window.location.assign(homeLoginHref("exams", `/exams/quizzes/${quizId}`)); return; }
        const response = await fetch(`/exams/api/quizzes/${encodeURIComponent(quizId)}/start`, {
          method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": body.session.csrfToken },
        });
        if (!response.ok) throw new Error("Unable to start this quiz");
        const result = await response.json() as { redirectTo?: string };
        if (!result.redirectTo?.startsWith("/")) throw new Error("Invalid start response");
        window.location.assign(result.redirectTo);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start this quiz"); setBusy(false); }
    }}>{busy ? "Starting…" : "Start quiz"}</button>
    {error ? <small role="alert">{error}</small> : null}
  </div>;
}
