"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiUtils } from "@/src/dashboard/utils/ApiUtils";
import styles from "./CourseReader.module.css";

interface CourseSectionCompletionButtonProps {
  courseId: string;
  sectionId: string;
  disabled: boolean;
  disabledReason?: string;
}

export default function CourseSectionCompletionButton({ courseId, sectionId, disabled, disabledReason }: CourseSectionCompletionButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = async () => {
    setPending(true);
    setError(null);
    try {
      const sessionResponse = await fetch("/exams/api/auth/session", { credentials: "include", cache: "no-store" });
      const sessionBody = await sessionResponse.json() as { session?: { csrfToken?: string } | null };
      const csrfToken = sessionBody.session?.csrfToken;
      if (!csrfToken) throw new Error("Your Exams session has expired. Please sign in again.");
      const response = await fetch(`${ApiUtils.apiOrigin}/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "We could not save your course progress.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  };

  return <div className={styles.completion}>
    {disabledReason ? <p className={styles.completionHint}>{disabledReason}</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <button type="button" className={styles.completeButton} disabled={disabled || pending} onClick={() => void complete()}>
      {pending ? "Saving…" : "Mark section complete"}
    </button>
  </div>;
}
