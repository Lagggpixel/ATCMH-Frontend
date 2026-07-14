import { EXAMS_BASE_PATH } from "./unified-routes";

export interface ExamsCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: typeof EXAMS_BASE_PATH;
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
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: !isExactHttpLoopbackOrigin(frontendPublicOrigin),
    path: EXAMS_BASE_PATH,
  };
}
