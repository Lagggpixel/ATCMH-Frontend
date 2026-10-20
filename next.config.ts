import type {NextConfig} from "next";
import {PHASE_DEVELOPMENT_SERVER} from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    output: "standalone",
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    redirects: async () => [
      {source: "/simulator/assignments", destination: "/sweatbox/staff", permanent: false},
      {source: "/simulator/mentee/assignments", destination: "/sweatbox/staff", permanent: false},
      {source: "/sweatbox/assignments", destination: "/sweatbox/staff", permanent: false},
      {source: "/sweatbox/mentee/assignments", destination: "/sweatbox/staff", permanent: false},
      {source: "/simulator", destination: "/sweatbox", permanent: true},
      {source: "/simulator/:section(staff|mentee|scenarios|replays|about)/:path*", destination: "/sweatbox/:section/:path*", permanent: true},
    ],
    // Keep source routes and static assets stable while exposing Sweatbox URLs.
    rewrites: async () => [{source: "/sweatbox/:path*", destination: "/simulator/:path*"}],
  };
}
