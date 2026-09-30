import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

import {reportWebsiteAccess} from "./lib/website-access";

import { securityHeadersFor } from "./lib/security-headers";
import {canOpenWraps} from "./wraps/wraps-access";
import {publicRuntimeConfig} from "./lib/runtime-config";

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  event.waitUntil(reportWebsiteAccess(request));
  const wraps = request.nextUrl.pathname === "/wraps" || request.nextUrl.pathname.startsWith("/wraps/");
  let allowed = true;
  if (wraps) {
    try {
      const config = publicRuntimeConfig();
      allowed = await canOpenWraps(request.headers.get("cookie") ?? "", {backendOrigin: config.dashboardApiUrl, frontendOrigin: config.frontendPublicOrigin});
    } catch { allowed = false; }
  }
  // Respond before React can stream: unauthorized requests must be HTTP 404s.
  const response = allowed ? NextResponse.next() : new NextResponse("Not found", {status: 404});
  for (const { key, value } of securityHeadersFor(process.env, process.env.NODE_ENV)) {
    response.headers.set(key, value);
  }
  if (request.nextUrl.pathname === "/link-results" || request.nextUrl.pathname === "/wraps" || request.nextUrl.pathname.startsWith("/wraps/")) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}

export const config = { matcher: "/:path*" };
