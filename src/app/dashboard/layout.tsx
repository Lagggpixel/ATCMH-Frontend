import type {ReactNode} from "react";
import DashboardAccessGate from "@/src/dashboard/DashboardAccessGate";
import DashboardHeader from "@/src/dashboard/DashboardHeader";
import DashboardRuntime from "@/src/dashboard/DashboardRuntime";
import SiteFrame from "@/src/platform/SiteFrame";
import DashboardThemeProvider from "@/src/dashboard/theme/DashboardThemeProvider";
import {simulatorEnabled} from "@/src/simulator/feature";
import "@/src/dashboard/theme/dashboard-theme.css";

export const dynamic = "force-dynamic";

export default function DashboardLayout({children}: Readonly<{children: ReactNode}>) {
    return <DashboardThemeProvider><SiteFrame theme="light" footer={false} header={<DashboardHeader simulatorEnabled={simulatorEnabled({SIMULATOR_ENABLED: process.env.SIMULATOR_ENABLED})}/>}><DashboardAccessGate><DashboardRuntime>{children}</DashboardRuntime></DashboardAccessGate></SiteFrame></DashboardThemeProvider>;
}
