import DashboardRuntime from "@/src/dashboard/DashboardRuntime";
import DashboardRoute from "@/src/dashboard/DashboardRoute";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
    return <DashboardRuntime><DashboardRoute/></DashboardRuntime>;
}
