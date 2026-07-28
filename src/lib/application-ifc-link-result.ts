import {createHmac, timingSafeEqual} from "node:crypto";

const signingContext = "atcmh:application-ifc-result:v1:";
const maximumTokenLength = 2048;
const maximumLifetimeSeconds = 600;
const clockSkewSeconds = 60;

export const applicationIfcLinkOutcomes = [
  "linked",
  "cancelled_or_not_approved",
  "temporarily_unavailable",
  "login_required",
  "interaction_required",
  "provider_failure",
  "invalid_attempt",
  "link_conflict",
  "persistence_failure",
] as const;

export type ApplicationIfcLinkOutcome = typeof applicationIfcLinkOutcomes[number];
export type ApplicationType = "mentor" | "written" | "mock";

export interface ApplicationIfcLinkResult {
  outcome: ApplicationIfcLinkOutcome;
  attemptReference?: string;
  applicationType?: ApplicationType;
}
const outcomes = new Set<string>(applicationIfcLinkOutcomes);
const applicationTypes = new Set<string>(["mentor", "written", "mock"]);

const signature = (secret: string, payload: string) => createHmac("sha256", secret)
  .update(`${signingContext}${payload}`)
  .digest("base64url");

export function readApplicationIfcLinkResult(
  secret: string | undefined,
  token: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): ApplicationIfcLinkResult | undefined {
  if (!secret || Buffer.byteLength(secret) < 32 || !token || token.length > maximumTokenLength) return undefined;
  const [payload, suppliedSignature, ...extra] = token.split(".");
  if (!payload || !suppliedSignature || extra.length || !/^[A-Za-z0-9_-]+$/.test(payload)
      || !/^[A-Za-z0-9_-]{43}$/.test(suppliedSignature)) return undefined;
  const expected = Buffer.from(signature(secret, payload), "ascii");
  const supplied = Buffer.from(suppliedSignature, "ascii");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return undefined;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (!claims || Array.isArray(claims) || claims.v !== 1 || typeof claims.outcome !== "string"
        || !outcomes.has(claims.outcome) || !Number.isInteger(claims.issuedAt)
        || !Number.isInteger(claims.expiresAt)) return undefined;
    const issuedAt = claims.issuedAt as number;
    const expiresAt = claims.expiresAt as number;
    if (issuedAt > nowSeconds + clockSkewSeconds || expiresAt <= nowSeconds
        || expiresAt <= issuedAt || expiresAt - issuedAt > maximumLifetimeSeconds) return undefined;

    const allowedKeys = new Set(["v", "outcome", "attemptId", "applicationType", "issuedAt", "expiresAt"]);
    if (Object.keys(claims).some(key => !allowedKeys.has(key))) return undefined;
    if (claims.attemptId !== undefined
        && (typeof claims.attemptId !== "string" || !/^[1-9][0-9]{0,18}$/.test(claims.attemptId))) return undefined;
    if (claims.applicationType !== undefined
        && (typeof claims.applicationType !== "string" || !applicationTypes.has(claims.applicationType))) return undefined;
    const outcome = claims.outcome as ApplicationIfcLinkOutcome;
    if (outcome === "linked" ? claims.applicationType === undefined : claims.applicationType !== undefined) return undefined;

    return {
      outcome,
      ...(claims.attemptId ? {attemptReference: `application-ifc-oauth:${claims.attemptId}`} : {}),
      ...(claims.applicationType ? {applicationType: claims.applicationType as ApplicationType} : {}),
    };
  } catch {
    return undefined;
  }
}
