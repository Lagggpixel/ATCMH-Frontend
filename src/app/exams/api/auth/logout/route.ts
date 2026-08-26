import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { csrfMatches, examsSessionCookie, legacyDashboardSessionCookie, logoutCentralSession, loopbackSessionCookie, sessionCookie, sessionTokenFromCookieStore } from "@/src/lib/central-auth";
import { allowedMutationOrigins } from "@/src/lib/browser-session";
import { examsCookieOptions, legacyExamsCookieOptions, sessionCookieOptions } from "@/src/lib/exams-cookie";
import { getAppBaseUrl } from "@/src/lib/app-url";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = sessionTokenFromCookieStore(await cookies());
  const authorized = token && allowedMutationOrigins().has(request.headers.get("origin") ?? "")
    && csrfMatches(token, request.headers.get("X-CSRF-Token"));
  if (!authorized) return Response.json({ error: "Forbidden" }, { status: 403 });
  const revoked = await logoutCentralSession(token, false);
  const response = NextResponse.json(revoked ? { session: null } : { error: "Central logout is temporarily unavailable" }, { status: revoked ? 200 : 503 });
  const canonical = sessionCookieOptions(getAppBaseUrl().origin).secure ? sessionCookie : loopbackSessionCookie;
  response.cookies.set(canonical, "", {...sessionCookieOptions(getAppBaseUrl().origin), maxAge: 0});
  response.cookies.set(legacyDashboardSessionCookie, "", {...sessionCookieOptions(getAppBaseUrl().origin), maxAge: 0});
  response.cookies.set(examsSessionCookie, "", { ...legacyExamsCookieOptions(getAppBaseUrl().origin), maxAge: 0 });
  response.cookies.set(examsSessionCookie, "", { ...examsCookieOptions(getAppBaseUrl().origin), maxAge: 0 });
  return response;
}
