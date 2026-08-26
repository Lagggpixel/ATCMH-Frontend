import { type ManagementCapability } from "./permissions";
import {
  sessionCookie,
  csrfMatches,
  introspectCentralSession,
  legacyDashboardSessionCookie,
  loopbackSessionCookie,
  sessionTokenFromCookieHeader,
} from "./central-auth";
import { allowedMutationOrigins } from "./browser-session";

const managementCapabilities = new Set<ManagementCapability>([
  "manage-exams", "manage-courses", "import-exams", "unlock-learners", "review-attempts",
  "publish-exams", "manage-taxonomy", "manage-system",
]);

export interface AuthorizedManager {
  accountId: string;
  discordId: string;
  capabilities: ManagementCapability[];
  canManageAll: boolean;
  impersonating: boolean;
  impersonatedAccountId?: string;
  impersonatedDiscordId?: string;
}

function cookieToken(request: Request) {
  return sessionTokenFromCookieHeader(request.headers.get("cookie"));
}

function dashboardCookie(request: Request, token: string): string {
  const source = request.headers.get("cookie") ?? "";
  const name = source.includes(`${sessionCookie}=`) ? sessionCookie
    : source.includes(`${loopbackSessionCookie}=`) ? loopbackSessionCookie
      : legacyDashboardSessionCookie;
  return `${name}=${token}`;
}

interface CapabilityResponse {
  capabilities?: unknown;
  canManageAll?: unknown;
}

async function centralizedCapabilities(request: Request, token: string): Promise<CapabilityResponse | Response> {
  const apiUrl = process.env.DASHBOARD_API_URL?.replace(/\/$/, "");
  if (!apiUrl) return new Response("Authorization is temporarily unavailable", { status: 503 });
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/admin/exams-capabilities`, {
      headers: { cookie: dashboardCookie(request, token) },
      cache: "no-store",
    });
  } catch {
    return new Response("Authorization is temporarily unavailable", { status: 503 });
  }
  if (!response.ok) return response.status === 401 || response.status === 403
    ? new Response(response.status === 401 ? "Unauthorized" : "Forbidden", { status: response.status })
    : new Response("Authorization is temporarily unavailable", { status: 503 });
  return await response.json() as CapabilityResponse;
}

export async function requireManagementCapability(
  request: Request,
  capability: ManagementCapability,
  _ownerId?: string,
): Promise<AuthorizedManager | Response> {
  const token = cookieToken(request);
  if (!token) return new Response("Unauthorized", { status: 401 });

  const session = await introspectCentralSession(token);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    const origin = request.headers.get("origin");
    if (!origin || !allowedMutationOrigins().has(origin) || !csrfMatches(token, request.headers.get("X-CSRF-Token"))) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const centralized = await centralizedCapabilities(request, token);
  if (centralized instanceof Response) return centralized;
  const capabilities = Array.isArray(centralized.capabilities)
    ? centralized.capabilities.filter((value): value is ManagementCapability =>
      typeof value === "string" && managementCapabilities.has(value as ManagementCapability))
    : [];

  const actorDiscordId = session.impersonating ? session.realActorDiscordId! : session.discordId;
  const actorAccountId = session.impersonating ? session.realActorAccountId! : session.accountId;
  const actor: AuthorizedManager = {
    accountId: actorAccountId,
    discordId: actorDiscordId,
    capabilities,
    canManageAll: centralized.canManageAll === true,
    impersonating: session.impersonating,
    ...(session.impersonating ? { impersonatedAccountId: session.accountId, impersonatedDiscordId: session.discordId } : {}),
  };
  if (!actor.capabilities.includes(capability)) {
    return new Response("Forbidden", { status: 403 });
  }
  return actor;
}
