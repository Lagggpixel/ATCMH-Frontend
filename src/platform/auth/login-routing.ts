export type LoginApplication = "dashboard" | "exams";

export interface HomeLoginRequest {
  application: LoginApplication;
  returnTo: string;
}

const supportedAuthErrors = new Set([
  "cancelled", "invalid_login", "provider_failure", "link_conflict", "invalid_handoff",
  "consent_declined", "consent_expired", "invalid_consent",
]);

export const safeAuthError = (value: string | null | undefined) => value && supportedAuthErrors.has(value) ? value : undefined;

// References are opaque support correlation IDs, never server error details.
export const safeAuthRef = (value: string | null | undefined) => value && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : undefined;

const hasUnsafeSyntax = (value: string) =>
  !value.startsWith("/") || value.startsWith("//") || value.includes("\\")
  || value.includes("#") || value.includes("%") || /[\u0000-\u001f\u007f]/.test(value)
  || /(?:^|\/)\.{1,2}(?:\/|$)/.test(value);

export function safeLoginReturnTo(application: LoginApplication, value: string | null | undefined): string {
  const fallback = application === "dashboard" ? "/" : "/exams";
  if (!value || hasUnsafeSyntax(value)) return fallback;
  const path = value.split("?", 1)[0];
  if (application === "dashboard") {
    return path === "/" || path === "/account" || path === "/dashboard" || path.startsWith("/dashboard/")
      ? value : fallback;
  }
  return path === "/exams" || path.startsWith("/exams/") ? value : fallback;
}

export function resolveHomeLoginRequest(params: URLSearchParams): HomeLoginRequest {
  const application: LoginApplication = params.get("loginFor") === "exams" ? "exams" : "dashboard";
  return {application, returnTo: safeLoginReturnTo(application, params.get("returnTo"))};
}

export function homeLoginHref(application: LoginApplication, returnTo: string, authError?: string | null, authRef?: string | null): string {
  const query = new URLSearchParams({loginFor: application, returnTo: safeLoginReturnTo(application, returnTo)});
  const safeError = safeAuthError(authError);
  if (safeError) {
    query.set("authError", safeError);
    const safeReference = safeAuthRef(authRef);
    if (safeReference) query.set("authRef", safeReference);
  }
  return `/?${query.toString()}`;
}
