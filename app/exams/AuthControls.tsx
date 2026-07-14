"use client";

import { useState } from "react";
import { privacyPolicyUrl, termsOfServiceUrl } from "@/src/lib/login-policy-content";

export function LoginProviderLinks({ returnTo = "/exams/quizzes" }: { returnTo?: string }) {
  const encodedReturnTo = encodeURIComponent(returnTo);
  return (
    <div className="login-provider-choice">
      <span className="auth-provider-links">
        <a href={`/exams/api/auth/login?provider=discord&returnTo=${encodedReturnTo}`}>Discord login</a>
        <a href={`/exams/api/auth/login?provider=ifc&returnTo=${encodedReturnTo}`}>IFC login</a>
      </span>
      <p className="login-policy-disclosure" aria-label="To continue, you’ll be asked to agree to the Terms of Service and acknowledge the Privacy Policy.">
        To continue, you’ll be asked to agree to the <a href={termsOfServiceUrl}>Terms of Service</a> and acknowledge the <a href={privacyPolicyUrl}>Privacy Policy</a>.
      </p>
    </div>
  );
}

export function AuthControls({ signedIn }: { signedIn: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!signedIn) return <LoginProviderLinks />;
  return <button type="button" className="auth-logout" disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      const sessionResponse = await fetch("/exams/api/auth/session", { credentials: "include", cache: "no-store" });
      const body = await sessionResponse.json() as { session?: { csrfToken?: string } | null };
      if (!body.session?.csrfToken) throw new Error("Session unavailable");
      await fetch("/exams/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": body.session.csrfToken },
      });
    } finally {
      window.location.assign("/exams");
    }
  }}>{busy ? "Signing out…" : "Sign out"}</button>;
}
