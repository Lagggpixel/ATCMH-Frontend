"use client";

import { type MutableRefObject, useEffect, useRef } from "react";

import { ATTEMPT_NAVIGATION_MESSAGE, createAttemptNavigationProtection, sendAttemptKeepalive } from "./attempt-navigation";
import {useConfirmation} from "@/src/platform/confirmation/ConfirmationProvider";

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
  const confirm = useConfirmation();

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
      confirmNavigation: () => confirm({title: "Leave this exam?", message: ATTEMPT_NAVIGATION_MESSAGE, confirmLabel: "Submit and leave", cancelLabel: "Continue exam", tone: "danger"}),
      sendKeepalive: (id, answers) => csrfToken ? sendAttemptKeepalive(id, answers, csrfToken) : false,
    });
    protection.install();
    return () => protection.uninstall();
  }, [active, answersRef, csrfToken, quizId, confirm]);
}
