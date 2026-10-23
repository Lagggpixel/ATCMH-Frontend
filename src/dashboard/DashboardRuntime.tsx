import type {ReactNode} from "react";
import {publicRuntimeConfig} from "@/src/lib/runtime-config";
import DashboardProvider from "./DashboardProvider";
import DashboardQuickSearch from "./components/admin/DashboardQuickSearch";

export default function DashboardRuntime({children}: {children: ReactNode}) {
    const {dashboardApiUrl} = publicRuntimeConfig();
    return <DashboardProvider dashboardApiUrl={dashboardApiUrl}><DashboardQuickSearch/>{children}</DashboardProvider>;
}
