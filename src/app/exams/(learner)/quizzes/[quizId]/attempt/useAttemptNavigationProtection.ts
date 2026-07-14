"use client";

import { type MutableRefObject, useEffect, useRef } from "react";

import { createAttemptNavigationProtection, sendAttemptKeepalive } from "./attempt-navigation";

interface UseAttemptNavigationProtectionOptions {
  active: boolean;
  quizId: string;
  answersRef: MutableRefObject<Record<string, string>>;
  onConfirmedNavigation(): Promise<boolean>;
  csrfToken?: string;
}

export function useAttemptNavigationProtection({
  active,
  quizId,
  answersRef,
  onConfirmedNavigation,
  csrfToken,
}: UseAttemptNavigationProtectionOptions) {
  const callbackRef = useRef(onConfirmedNavigation);

  useEffect(() => {
    callbackRef.current = onConfirmedNavigation;
  }, [onConfirmedNavigation]);

  useEffect(() => {
    if (!active) return;

    const protection = createAttemptNavigationProtection({
      window,
      quizId,
      getAnswers: () => answersRef.current,
      onConfirmedNavigation: () => callbackRef.current(),
      sendKeepalive: (id, answers) => csrfToken ? sendAttemptKeepalive(id, answers, csrfToken) : false,
    });
    protection.install();
    return () => protection.uninstall();
  }, [active, answersRef, csrfToken, quizId]);
}
