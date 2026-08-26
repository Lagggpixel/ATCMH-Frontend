export interface ExamsCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  domain?: string;
}

/** The only account-session cookie. Host-only by construction. */
export function sessionCookieOptions(frontendPublicOrigin: string): ExamsCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: !isExactHttpLoopbackOrigin(frontendPublicOrigin),
    path: "/",
  };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isExactHttpLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname) && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function examsCookieOptions(frontendPublicOrigin: string): ExamsCookieOptions {
  const domain = (() => {
    try {
      const hostname = new URL(frontendPublicOrigin).hostname.toLowerCase();
      return hostname === "www.atcmh.org" || hostname === "atcmh.org" ? "atcmh.org" : undefined;
    } catch {
      return undefined;
    }
  })();
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: !isExactHttpLoopbackOrigin(frontendPublicOrigin),
    path: "/",
    ...(domain ? {domain} : {}),
  };
}

/** Legacy path-scoped options used to retire the old session cookie and scope attempt starts. */
export function legacyExamsCookieOptions(frontendPublicOrigin: string) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: !isExactHttpLoopbackOrigin(frontendPublicOrigin),
    path: "/exams" as const,
  };
}

/** Attempt-start snapshots are only needed by the Exams app, not the API host. */
export function attemptCookieOptions(frontendPublicOrigin: string) {
  return legacyExamsCookieOptions(frontendPublicOrigin);
}
