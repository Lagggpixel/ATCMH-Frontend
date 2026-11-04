import {timingSafeEqual} from "node:crypto";
import {z} from "zod/v3";
import {SessionError} from "../sessions";
import type {MenteeAdmission} from "./session-auth";
import type {Actor} from "./session-service";

const actorHeader = "x-sweatbox-actor";
const identity = z.object({
  actor: z.object({
    accountId: z.string().min(1).max(256), displayName: z.string().max(128).optional(),
    discordId: z.string().min(1).max(64).optional(), simulatorAccess: z.literal(false).optional(),
    canAssign: z.boolean().optional(), superAdmin: z.boolean().optional(),
  }).strict(),
  expiresAt: z.number().int(),
}).strict();
const lifetime = 60_000;

export function delegationHeaders(actor: Actor, now = Date.now()) {
  const {accountId, displayName, discordId, simulatorAccess, canAssign, superAdmin} = actor;
  const value = {actor: {accountId, displayName, discordId, simulatorAccess: simulatorAccess === false ? false : undefined, canAssign, superAdmin}, expiresAt: now + lifetime};
  return {[actorHeader]: Buffer.from(JSON.stringify(value)).toString("base64url")};
}

export function requireGateway(request: Request, key: string) {
  const expected = Buffer.from(`Bearer ${key}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (key.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new SessionError("unauthorized", "Sweatbox runtime credentials are invalid.", 401);
}

export async function authorizeDelegation(request: Request, staff: boolean, admission: MenteeAdmission = {}, now = Date.now()): Promise<Actor> {
  let value: unknown;
  try {value = JSON.parse(Buffer.from(request.headers.get(actorHeader) ?? "", "base64url").toString("utf8"));}
  catch {throw new SessionError("unauthorized", "Sweatbox identity is missing.", 401);}
  const parsed = identity.safeParse(value);
  if (!parsed.success) throw new SessionError("unauthorized", "Sweatbox identity is invalid.", 401);
  if (parsed.data.expiresAt <= now || parsed.data.expiresAt > now + lifetime)
    throw new SessionError("unavailable", "Refreshing Sweatbox connection.", 503);
  const {actor} = parsed.data;
  if (actor.simulatorAccess !== false) return {...actor, staff};
  if (staff || !actor.discordId || !(admission.anySignedIn || await admission.hasAssignment?.(actor.discordId)))
    throw new SessionError("forbidden", "Sweatbox access is limited to staff, administrators, Sweatbox Testers and assigned mentees.", 403);
  return {accountId: actor.accountId, displayName: actor.displayName, discordId: actor.discordId, simulatorAccess: false, staff: false};
}
