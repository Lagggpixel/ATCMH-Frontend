import "server-only";

import { parseFrontendPublicOrigin } from "./frontend-origin";

export interface AppUrlEnvironment {
  readonly [name: string]: string | undefined;
  FRONTEND_PUBLIC_ORIGIN?: string;
  NODE_ENV?: string;
}

const DEVELOPMENT_FRONTEND_PUBLIC_ORIGIN = "http://localhost:3000";
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function getAppBaseUrl(env: AppUrlEnvironment = process.env): URL {
  const configured = env.FRONTEND_PUBLIC_ORIGIN ?? (env.NODE_ENV === "production" ? undefined : DEVELOPMENT_FRONTEND_PUBLIC_ORIGIN);
  if (!configured) throw new Error("FRONTEND_PUBLIC_ORIGIN is required in production.");
  return parseFrontendPublicOrigin(configured);
}

export function appUrl(path: string, env: AppUrlEnvironment = process.env): URL {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || CONTROL_CHARACTER.test(path)) {
    throw new Error("App URLs require a safe root-relative path.");
  }

  return new URL(path, getAppBaseUrl(env));
}
