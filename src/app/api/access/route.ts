export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.FRONTEND_PUBLIC_ORIGIN
    ? new URL(process.env.FRONTEND_PUBLIC_ORIGIN).origin
    : process.env.NODE_ENV === "production" ? undefined : new URL(request.url).origin;
  if (!expectedOrigin || (origin && origin !== expectedOrigin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return new Response(null, {status: 403, headers: {"Cache-Control": "no-store"}});
  }
  return new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
}
