import { csrfMatches, examsSessionCookie, introspectCentralSession, type CentralSession } from "./central-auth";
import { parseFrontendPublicOrigin } from "./frontend-origin";

export function cookieValue(header: string | null, name = examsSessionCookie): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [candidate, ...value] = part.trim().split("=");
    if (candidate === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function allowedMutationOrigins(): Set<string> {
  const origins = new Set<string>();
  try { origins.add(parseFrontendPublicOrigin(process.env.FRONTEND_PUBLIC_ORIGIN ?? "").origin); } catch { /* fail closed */ }
  return origins;
}

export async function authorizeLearnerMutation(
  origin: string | null,
  cookieHeader: string | null,
  csrf: string | null,
): Promise<{ token: string; session: CentralSession } | undefined> {
  const token = cookieValue(cookieHeader);
  if (!token || !origin || !allowedMutationOrigins().has(origin) || !csrfMatches(token, csrf)) return undefined;
  const session = await introspectCentralSession(token);
  return session ? { token, session } : undefined;
}
