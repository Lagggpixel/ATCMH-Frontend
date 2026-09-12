import {createHmac} from "node:crypto";
import {sessionTokenFromCookieHeader} from "./central-auth";

type ReportingEnvironment = {DASHBOARD_API_URL?: string; EXAMS_AUTH_KEY?: string};
const reportingEnvironment = (): ReportingEnvironment => ({DASHBOARD_API_URL: process.env.DASHBOARD_API_URL, EXAMS_AUTH_KEY: process.env.EXAMS_AUTH_KEY});
export function websiteAccessReportedHeaders(env: ReportingEnvironment = reportingEnvironment()): Record<string, string> {
  const key = env.EXAMS_AUTH_KEY?.trim();
  return key ? {"X-Atcmh-Access-Reported": createHmac("sha256", key).update("atcmh-frontend-access-report-v1").digest("hex")} : {};
}

const assetExtension = /\.(?:avif|css|gif|ico|jpe?g|js|map|png|svg|webp|woff2?|ttf|txt|xml)$/i;

export function shouldReportWebsiteAccess(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return request.method !== "OPTIONS" && !path.startsWith("/_next/") && path !== "/api/health"
    && path !== "/health" && !assetExtension.test(path);
}

export function websiteAccessPayload(request: Request) {
  let token: string | undefined;
  try { token = sessionTokenFromCookieHeader(request.headers.get("cookie")); } catch { /* Malformed cookies are anonymous. */ }
  if (token && token.length > 4096) token = undefined;
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ...(token ? {token} : {}),
    // Never shorten a forwarding chain: doing so can change which hop is trusted.
    ...(forwardedFor && forwardedFor.length <= 4096 ? {forwardedFor} : {}),
    path: new URL(request.url).pathname.slice(0, 2048),
    method: request.method.toUpperCase().slice(0, 16),
  };
}

export async function reportWebsiteAccess(request: Request, env: ReportingEnvironment = reportingEnvironment()): Promise<void> {
  if (!shouldReportWebsiteAccess(request) || !env.DASHBOARD_API_URL || !env.EXAMS_AUTH_KEY?.trim()) return;
  try {
    const response = await fetch(new URL("/internal/auth/request-events", env.DASHBOARD_API_URL), {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-Exams-Auth-Key": env.EXAMS_AUTH_KEY.trim()},
      body: JSON.stringify(websiteAccessPayload(request)),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    if (!response.ok) console.warn("Website access reporting failed");
  } catch { console.warn("Website access reporting failed"); }
}
