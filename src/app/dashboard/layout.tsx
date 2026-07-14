import type {ReactNode} from "react";
import DashboardAccessGate from "@/src/dashboard/DashboardAccessGate";
import DashboardRuntime from "@/src/dashboard/DashboardRuntime";
import SiteFrame from "@/src/platform/SiteFrame";

export const dynamic = "force-dynamic";

export default function DashboardLayout({children}: Readonly<{children: ReactNode}>) {
    return <SiteFrame footer={false}><DashboardAccessGate><DashboardRuntime>{children}</DashboardRuntime></DashboardAccessGate></SiteFrame>;
}
