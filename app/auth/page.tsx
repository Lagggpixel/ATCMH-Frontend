import DashboardRuntime from "@/src/dashboard/DashboardRuntime";
import SharedDashboardPage from "@/src/dashboard/SharedDashboardPage";

export const dynamic = "force-dynamic";

export default function AuthPage() {
    return <DashboardRuntime><SharedDashboardPage page="auth"/></DashboardRuntime>;
}
