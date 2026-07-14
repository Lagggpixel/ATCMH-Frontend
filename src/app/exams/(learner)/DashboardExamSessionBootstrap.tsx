"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {bootstrapDashboardExamsSession} from "./dashboard-exams-session-bootstrap";

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "We could not connect your Dashboard session to the Exam Center.";
}

/** Bridges a Dashboard-only browser into the local Exams session once. */
export default function DashboardExamSessionBootstrap() {
  const router = useRouter();
  const hasStarted = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const bootstrap = useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    setError(null);
    try {
      const result = await bootstrapDashboardExamsSession();
      if (result === "bridged") router.refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsRetrying(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void bootstrap(), 0);
    return () => window.clearTimeout(timer);
  }, [bootstrap]);

  const retry = () => {
    hasStarted.current = false;
    setIsRetrying(true);
    void bootstrap();
  };

  if (!error) return null;
  return <section className="exam-session-bootstrap-error" role="alert">
    <p>We could not load your signed-in Exam Center access. {error}</p>
    <button type="button" onClick={retry} disabled={isRetrying}>{isRetrying ? "Retrying…" : "Try again"}</button>
  </section>;
}
