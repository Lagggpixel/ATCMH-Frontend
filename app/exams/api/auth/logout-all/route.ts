import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { csrfMatches, examsSessionCookie, logoutCentralSession } from "@/src/lib/central-auth";
import { allowedMutationOrigins } from "@/src/lib/browser-session";
import { examsCookieOptions } from "@/src/lib/exams-cookie";
import { getAppBaseUrl } from "@/src/lib/app-url";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = (await cookies()).get(examsSessionCookie)?.value;
  if (!token || !allowedMutationOrigins(true).has(request.headers.get("origin") ?? "")
    || !csrfMatches(token, request.headers.get("X-CSRF-Token"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const revoked = await logoutCentralSession(token, true);
  const response = NextResponse.json(revoked ? { session: null } : { error: "Central logout is temporarily unavailable" }, { status: revoked ? 200 : 503 });
  response.cookies.set(examsSessionCookie, "", { ...examsCookieOptions(getAppBaseUrl().origin), maxAge: 0 });
  return response;
}
