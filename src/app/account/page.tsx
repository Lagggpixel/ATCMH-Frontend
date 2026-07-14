import DashboardRuntime from "@/src/dashboard/DashboardRuntime";
import SharedDashboardPage from "@/src/dashboard/SharedDashboardPage";

export const dynamic = "force-dynamic";

export default function AccountPage() {
    return <DashboardRuntime><SharedDashboardPage page="account"/></DashboardRuntime>;
}
