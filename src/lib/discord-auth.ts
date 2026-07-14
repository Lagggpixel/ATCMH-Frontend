import { type ManagementCapability } from "./permissions";
import { csrfMatches, examsSessionCookie, introspectCentralSession } from "./central-auth";
import { allowedMutationOrigins } from "./browser-session";

const mentorCapabilities: ManagementCapability[] = ["manage-exams", "import-exams", "unlock-learners", "review-attempts"];
const administratorCapabilities: ManagementCapability[] = [...mentorCapabilities, "publish-exams", "manage-taxonomy", "manage-system"];

export interface AuthorizedManager {
  accountId: string;
  discordId: string;
  capabilities: ManagementCapability[];
  canManageAll: boolean;
  impersonating: boolean;
  impersonatedAccountId?: string;
  impersonatedDiscordId?: string;
}

interface DiscordMember { roles: unknown }

export function parseDiscordIdList(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map((id) => id.trim()).filter(Boolean));
}

export interface DiscordStaffClassification {
  isAdministrator: boolean;
  isMentor: boolean;
}

export function classifyDiscordStaff(discordId: string, roles: unknown): DiscordStaffClassification {
  const validRoles = Array.isArray(roles) && roles.every((role): role is string => typeof role === "string")
    ? roles
    : [];
  const administratorRoleIds = parseDiscordIdList(process.env.DISCORD_ADMIN_ROLE_IDS);
  const mentorRoleIds = parseDiscordIdList(process.env.DISCORD_MENTOR_ROLE_IDS);
  const isAdministrator = parseDiscordIdList(process.env.DISCORD_ADMIN_USER_IDS).has(discordId)
    || validRoles.some((role) => administratorRoleIds.has(role));
  return {
    isAdministrator,
    isMentor: isAdministrator || validRoles.some((role) => mentorRoleIds.has(role)),
  };
}

function cookieToken(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === examsSessionCookie) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

type DiscordLookup<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number };

async function discordJson<T>(url: string, authorization: string): Promise<DiscordLookup<T>> {
  const response = await fetch(url, { headers: { authorization }, cache: "no-store" });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, status: response.status, body: await response.json() as T };
}

export async function requireManagementCapability(
  request: Request,
  capability: ManagementCapability,
  _ownerId?: string,
): Promise<AuthorizedManager | Response> {
  const token = cookieToken(request);
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!token || !guildId || !botToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const session = await introspectCentralSession(token);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    const origin = request.headers.get("origin");
    if (!origin || !allowedMutationOrigins().has(origin) || !csrfMatches(token, request.headers.get("X-CSRF-Token"))) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  let member: DiscordLookup<DiscordMember>;
  try {
    member = await discordJson<DiscordMember>(`https://discord.com/api/v10/guilds/${guildId}/members/${session.discordId}`, `Bot ${botToken}`);
  } catch {
    return new Response("Discord authorization is temporarily unavailable", { status: 503 });
  }
  if (!member.ok) return member.status === 404
    ? new Response("Forbidden", { status: 403 })
    : new Response("Discord authorization is temporarily unavailable", { status: 503 });

  const actorDiscordId = session.impersonating ? session.realActorDiscordId! : session.discordId;
  const actorAccountId = session.impersonating ? session.realActorAccountId! : session.accountId;
  // Impersonation has the target user's authorization. The real actor is kept
  // separately for audit attribution and never lends roles to the target.
  const { isAdministrator, isMentor } = classifyDiscordStaff(session.discordId, member.body.roles);
  const actor: AuthorizedManager = {
    accountId: actorAccountId,
    discordId: actorDiscordId,
    capabilities: isAdministrator ? administratorCapabilities : isMentor ? mentorCapabilities : [],
    canManageAll: isAdministrator,
    impersonating: session.impersonating,
    ...(session.impersonating ? { impersonatedAccountId: session.accountId, impersonatedDiscordId: session.discordId } : {}),
  };
  if (!actor.capabilities.includes(capability)) {
    return new Response("Forbidden", { status: 403 });
  }
  return actor;
}
