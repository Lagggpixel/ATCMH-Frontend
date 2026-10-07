import DashboardRoute from "@/src/dashboard/DashboardRoute";
import {version} from "@/package.json";

export default function DashboardPage() {
    return <DashboardRoute frontendVersion={version}/>;
}
