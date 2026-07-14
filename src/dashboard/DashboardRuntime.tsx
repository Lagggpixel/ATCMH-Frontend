import type {ReactNode} from "react";
import {publicRuntimeConfig} from "@/src/lib/runtime-config";
import DashboardProvider from "./DashboardProvider";

export default function DashboardRuntime({children}: {children: ReactNode}) {
    const {dashboardApiUrl} = publicRuntimeConfig();
    return <DashboardProvider dashboardApiUrl={dashboardApiUrl}>{children}</DashboardProvider>;
}
