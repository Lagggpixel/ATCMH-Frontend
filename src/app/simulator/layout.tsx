import type {Metadata} from "next";
import type {ReactNode} from "react";
import {notFound} from "next/navigation";
import {simulatorEnabled} from "@/src/simulator/feature";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "ATCMH Sweatbox", description: "Independent IFATC practice. Simulation only; not affiliated with or endorsed by Infinite Flight.", robots: {index: false, follow: false}};
export default function SimulatorLayout({children}: {children: ReactNode}) {
  if (!simulatorEnabled({SIMULATOR_ENABLED: process.env.SIMULATOR_ENABLED})) notFound();
  return children;
}
