import { allowedMutationOrigins } from "./browser-session";

function originFor(request: Request) {
  const origin = request.headers.get("origin");
  return origin && allowedMutationOrigins(true).has(origin) ? origin : undefined;
}

export function withManagementCors(request: Request, response: Response): Response {
  const origin = originFor(request);
  if (!origin) return response;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
  response.headers.set("Access-Control-Max-Age", "600");
  response.headers.set("Vary", "Origin");
  return response;
}

export function corsPreflight(request: Request): Response {
  if (!originFor(request)) return new Response("Forbidden", { status: 403 });
  const requestedMethod = request.headers.get("access-control-request-method")?.toUpperCase();
  if (requestedMethod && !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(requestedMethod)) {
    return withManagementCors(request, new Response("Method Not Allowed", { status: 405 }));
  }
  return withManagementCors(request, new Response(null, { status: 204 }));
}
