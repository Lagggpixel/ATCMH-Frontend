import DashboardRuntime from "@/src/dashboard/DashboardRuntime";
import DashboardRoute from "@/src/dashboard/DashboardRoute";
import DashboardAccessGate from "@/src/dashboard/DashboardAccessGate";
import SiteFrame from "@/src/platform/SiteFrame";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
    return <SiteFrame footer={false}><DashboardAccessGate><DashboardRuntime><DashboardRoute/></DashboardRuntime></DashboardAccessGate></SiteFrame>;
}
