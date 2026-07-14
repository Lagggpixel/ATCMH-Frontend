"use client";

import {useState} from "react";

export default function ExamLogoutButton({label}: {label: string}) {
  const [busy, setBusy] = useState(false);
  return <span className="exam-session-control"><span title={label}>Exam account</span><button type="button" disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      const response = await fetch("/exams/api/auth/session", {credentials: "include", cache: "no-store"});
      const body = await response.json() as {session?: {csrfToken?: string} | null};
      if (body.session?.csrfToken) await fetch("/exams/api/auth/logout", {method: "POST", credentials: "include", headers: {"X-CSRF-Token": body.session.csrfToken}});
    } finally { window.location.assign("/exams"); }
  }}>{busy ? "Signing out…" : "Sign out"}</button></span>;
}
