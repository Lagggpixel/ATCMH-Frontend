import { z } from "zod";

export interface RuntimeEnvironment {
  readonly [name: string]: string | undefined;
  FRONTEND_PUBLIC_ORIGIN?: string;
  DASHBOARD_API_URL?: string;
}

const origin = z.string().min(1).transform((value, context) => {
  try {
    const url = new URL(value);
    const loopback = url.protocol === "http:" && new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname);
    if ((url.protocol !== "https:" && !loopback) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "must be an HTTPS origin or exact HTTP loopback origin" });
      return z.NEVER;
    }
    return url.origin;
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "must be a valid origin" });
    return z.NEVER;
  }
});

const schema = z.object({
  FRONTEND_PUBLIC_ORIGIN: origin,
  DASHBOARD_API_URL: origin,
});

const SECRET_NAME = /(SECRET|TOKEN|KEY|PASSWORD)/i;

export function loadPublicRuntimeConfig(env: RuntimeEnvironment) {
  const leaked = Object.keys(env).find((name) => name.startsWith("NEXT_PUBLIC_") && SECRET_NAME.test(name));
  if (leaked) throw new Error(`${leaked} must not expose a secret to the browser.`);
  const parsed = schema.parse(env);
  return {
    frontendPublicOrigin: parsed.FRONTEND_PUBLIC_ORIGIN,
    dashboardApiUrl: parsed.DASHBOARD_API_URL,
  };
}

export function resolvePublicRuntimeConfig(env: RuntimeEnvironment, nodeEnv: string | undefined) {
  if (nodeEnv === "production") return loadPublicRuntimeConfig(env);
  return loadPublicRuntimeConfig({
    FRONTEND_PUBLIC_ORIGIN: env.FRONTEND_PUBLIC_ORIGIN ?? "http://localhost:3000",
    DASHBOARD_API_URL: env.DASHBOARD_API_URL ?? "http://localhost:3001",
    ...env,
  });
}

export function publicRuntimeConfig() {
  return resolvePublicRuntimeConfig({
    FRONTEND_PUBLIC_ORIGIN: process.env.FRONTEND_PUBLIC_ORIGIN,
    DASHBOARD_API_URL: process.env.DASHBOARD_API_URL,
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("NEXT_PUBLIC_"))),
  }, process.env.NODE_ENV);
}
