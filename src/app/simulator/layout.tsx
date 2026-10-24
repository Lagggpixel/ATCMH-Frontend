import type {Metadata, Viewport} from "next";
import type {ReactNode} from "react";
import {notFound} from "next/navigation";
import {simulatorEnabled} from "@/src/simulator/feature";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "ATCMH Sweatbox", description: "Independent IFATC practice. Simulation only; not affiliated with or endorsed by Infinite Flight.", robots: {index: false, follow: false},
  manifest: "/sweatbox/manifest.webmanifest", appleWebApp: {capable: true, title: "Sweatbox", statusBarStyle: "default"}, icons: {apple: "/dashboard-icon.png"}};
// The radar and Your sweatbox pad for safe areas, so the installed app can use the full screen in landscape.
export const viewport: Viewport = {viewportFit: "cover"};
export default function SimulatorLayout({children}: {children: ReactNode}) {
  if (!simulatorEnabled({SIMULATOR_ENABLED: process.env.SIMULATOR_ENABLED})) notFound();
  return children;
}
