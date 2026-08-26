import {NextResponse} from "next/server";

import {appUrl} from "@/src/lib/app-url";
import {
  examsSessionCookie,
  exchangeCentralHandoff,
  legacyDashboardSessionCookie,
  loopbackSessionCookie,
  safeLocalReturnTo,
  sessionCookie,
  sessionMaxAge,
} from "@/src/lib/central-auth";
import {examsCookieOptions, legacyExamsCookieOptions, sessionCookieOptions} from "@/src/lib/exams-cookie";

export const runtime = "nodejs";

const allowedAuthErrors = new Set([
  "cancelled", "provider_failure", "consent_declined", "invalid_consent", "consent_expired",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeLocalReturnTo(url.searchParams.get("returnTo"));
  const authError = url.searchParams.get("authError");
  if (authError && allowedAuthErrors.has(authError)) {
    return NextResponse.redirect(appUrl(`${returnTo}${returnTo.includes("?") ? "&" : "?"}authError=${authError}`));
  }
  const handoff = url.searchParams.get("handoff");
  if (!handoff) return NextResponse.redirect(appUrl(`/?login=1&returnTo=${encodeURIComponent(returnTo)}&authError=invalid_handoff`));
  try {
    const issued = await exchangeCentralHandoff(handoff);
    const remaining = Math.max(0, Math.floor((Date.parse(issued.expiresAt) - Date.now()) / 1000));
    if (remaining <= 0) throw new Error("Expired session");
    const response = NextResponse.redirect(appUrl(returnTo));
    const origin = appUrl("/").origin;
    const canonicalName = sessionCookieOptions(origin).secure ? sessionCookie : loopbackSessionCookie;
    response.cookies.set(canonicalName, issued.token, {
      ...sessionCookieOptions(origin), maxAge: Math.min(sessionMaxAge, remaining),
    });
    response.cookies.set(legacyDashboardSessionCookie, "", {...sessionCookieOptions(origin), maxAge: 0});
    response.cookies.set(examsSessionCookie, "", {...legacyExamsCookieOptions(origin), maxAge: 0});
    response.cookies.set(examsSessionCookie, "", {...examsCookieOptions(origin), maxAge: 0});
    return response;
  } catch {
    return NextResponse.redirect(appUrl(`/?login=1&returnTo=${encodeURIComponent(returnTo)}&authError=invalid_handoff`));
  }
}
