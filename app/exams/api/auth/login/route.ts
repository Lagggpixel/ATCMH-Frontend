import { NextResponse } from "next/server";

import { centralLoginUrl } from "@/src/lib/central-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  if (provider !== "discord" && provider !== "ifc") {
    return Response.json({ error: "Choose Discord or Infinite Flight" }, { status: 400 });
  }
  try {
    return NextResponse.redirect(centralLoginUrl(provider, url.searchParams.get("returnTo")));
  } catch {
    return Response.json({ error: "Central login is not configured" }, { status: 503 });
  }
}
