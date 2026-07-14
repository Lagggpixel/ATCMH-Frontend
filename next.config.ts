import type {NextConfig} from "next";

const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' https://dashboard-api.atcmh.org",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://dashboard-api.atcmh.org",
    "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
    {key: "Content-Security-Policy", value: contentSecurityPolicy},
    {key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload"},
    {key: "X-Content-Type-Options", value: "nosniff"},
    {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
    {key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()"},
    {key: "X-Frame-Options", value: "DENY"},
    {key: "Cross-Origin-Opener-Policy", value: "same-origin"},
];

const nextConfig: NextConfig = {
    output: "standalone",
    async headers() {
        return [{source: "/:path*", headers: securityHeaders}];
    },
};

export default nextConfig;
