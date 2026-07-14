import { NextResponse } from "next/server";

import { securityHeadersFor } from "./src/lib/security-headers";

export function proxy() {
  const response = NextResponse.next();
  for (const { key, value } of securityHeadersFor(process.env, process.env.NODE_ENV)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = { matcher: "/:path*" };
