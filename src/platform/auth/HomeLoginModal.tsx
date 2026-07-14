"use client";

import {useEffect, useRef} from "react";
import {useRouter, useSearchParams} from "next/navigation";
import {ApiUtils} from "@/src/dashboard/utils/ApiUtils";
import {loginPath} from "@/src/dashboard/utils/AuthSessionUtils";
import {privacyPolicyUrl, termsOfServiceUrl} from "@/src/lib/login-policy-content";
import {resolveHomeLoginRequest, safeAuthError, safeAuthRef} from "./login-routing";

const authErrorCopy: Record<string, string> = {
  cancelled: "Login was cancelled. No account changes were made.",
  invalid_login: "We could not complete that sign-in. Please start again. If this continues, contact support.",
  provider_failure: "The identity provider could not verify your sign-in. Please try again. If this continues, contact support.",
  link_conflict: "Your linked identities need review before login can continue.",
  invalid_handoff: "The one-time Exams login expired or was already used.",
  consent_declined: "You must accept the current policies before access can be granted.",
  consent_expired: "The policy confirmation expired. Please restart login.",
  invalid_consent: "The policy confirmation could not be verified. Please restart login.",
};

export default function HomeLoginModal() {
  const params = useSearchParams();
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const request = resolveHomeLoginRequest(params);
  const error = safeAuthError(params.get("authError"));
  const authRef = error ? safeAuthRef(params.get("authRef")) : undefined;
  const open = params.has("loginFor") || Boolean(error);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.replace("/");
      if (event.key !== "Tab") return;
      const dialog = closeRef.current?.closest("[role=dialog]");
      const controls = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href]")) : [];
      if (controls.length === 0) return;
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current >= controls.length - 1 ? 0 : current + 1);
      event.preventDefault();
      controls[next]?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, router]);

  if (!open) return null;
  const providerHref = (provider: "discord" | "ifc") => request.application === "dashboard"
    ? loginPath(ApiUtils.apiOrigin, provider, request.returnTo)
    : `/exams/api/auth/login?provider=${provider}&returnTo=${encodeURIComponent(request.returnTo)}`;

  return <div className="login-modal-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) router.replace("/");
  }}>
    <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
      <button ref={closeRef} className="login-modal-close" type="button" aria-label="Close login" onClick={() => router.replace("/")}>×</button>
      <p className="login-modal-eyebrow">ATCMH account</p>
      <h2 id="login-modal-title">Sign in to {request.application === "exams" ? "Exam Center" : "ATCMH"}</h2>
      {error ? <div className="login-modal-error" role="alert">
        <p>{authErrorCopy[error] ?? "Login could not be completed. Please try again."}</p>
        {authRef ? <p>Support reference: <code>{authRef}</code></p> : null}
      </div> : null}
      <div className="login-modal-actions">
        <a className="login-provider login-provider-discord" href={providerHref("discord")}>Continue with Discord</a>
        <a className="login-provider login-provider-ifc" href={providerHref("ifc")}>Continue with Infinite Flight</a>
      </div>
      <p className="login-modal-policy">Before access is granted, you will need to agree to the <a href={termsOfServiceUrl}>Terms of Service</a> and acknowledge the <a href={privacyPolicyUrl}>Privacy Policy</a>.</p>
    </section>
  </div>;
}
