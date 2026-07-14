import { NextResponse } from "next/server";

import { appUrl } from "@/src/lib/app-url";
import { examsSessionCookie, examsSessionMaxAge, exchangeCentralHandoff, safeLocalReturnTo } from "@/src/lib/central-auth";
import { examsCookieOptions } from "@/src/lib/exams-cookie";

export const runtime = "nodejs";
const allowedAuthErrors = new Set([
  "cancelled",
  "provider_failure",
  "consent_declined",
  "invalid_consent",
  "consent_expired",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authError = url.searchParams.get("authError");
  if (authError && allowedAuthErrors.has(authError)) {
    return NextResponse.redirect(appUrl(`/exams?authError=${authError}`));
  }
  const returnTo = safeLocalReturnTo(url.searchParams.get("returnTo"));
  const handoff = url.searchParams.get("handoff");
  if (!handoff) return NextResponse.redirect(appUrl(`/exams?authError=invalid_handoff`));
  try {
    const issued = await exchangeCentralHandoff(handoff);
    const remaining = Math.max(0, Math.floor((Date.parse(issued.expiresAt) - Date.now()) / 1000));
    if (remaining <= 0) throw new Error("Expired session");
    const response = NextResponse.redirect(appUrl(returnTo));
    response.cookies.set(examsSessionCookie, issued.token, {
      ...examsCookieOptions(appUrl("/").origin),
      maxAge: Math.min(examsSessionMaxAge, remaining),
    });
    return response;
  } catch {
    return NextResponse.redirect(appUrl(`/exams?authError=invalid_handoff`));
  }
}
