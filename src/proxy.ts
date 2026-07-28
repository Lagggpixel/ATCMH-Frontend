import { type NextRequest, NextResponse } from "next/server";

import { securityHeadersFor } from "./lib/security-headers";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  for (const { key, value } of securityHeadersFor(process.env, process.env.NODE_ENV)) {
    response.headers.set(key, value);
  }
  if (request.nextUrl.pathname === "/link-results") {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}

export const config = { matcher: "/:path*" };
