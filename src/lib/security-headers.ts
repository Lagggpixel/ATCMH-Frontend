import { resolvePublicRuntimeConfig, type RuntimeEnvironment } from "./runtime-config";

export function securityHeadersFor(env: RuntimeEnvironment, nodeEnv: string | undefined) {
  const isProduction = nodeEnv === "production";
  const { dashboardApiUrl } = resolvePublicRuntimeConfig(env, nodeEnv);
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    `form-action 'self' ${dashboardApiUrl}`,
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${dashboardApiUrl}`,
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  return [
    {key: "Content-Security-Policy", value: contentSecurityPolicy},
    ...(isProduction ? [{key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload"}] : []),
    {key: "X-Content-Type-Options", value: "nosniff"},
    {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
    {key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()"},
    {key: "X-Frame-Options", value: "DENY"},
    {key: "Cross-Origin-Opener-Policy", value: "same-origin"},
  ];
}
