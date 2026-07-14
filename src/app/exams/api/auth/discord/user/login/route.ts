import { NextResponse } from "next/server";

import { centralLoginUrl } from "@/src/lib/central-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return NextResponse.redirect(centralLoginUrl("discord", new URL(request.url).searchParams.get("returnTo"))); }
  catch { return new Response("Central login is not configured", { status: 503 }); }
}
