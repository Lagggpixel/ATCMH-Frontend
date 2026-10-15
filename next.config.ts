import type {NextConfig} from "next";
import {PHASE_DEVELOPMENT_SERVER} from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    output: "standalone",
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    redirects: async () => [
      {source: "/simulator/assignments", destination: "/simulator/staff", permanent: false},
      {source: "/simulator/mentee/assignments", destination: "/simulator/staff", permanent: false},
    ],
  };
}
