"use client";

import type {ReactNode} from "react";
import {usePathname} from "next/navigation";
import DashboardThemeProvider from "@/src/dashboard/theme/DashboardThemeProvider";
import SiteFrame from "./SiteFrame";

export default function LearnerSiteFrame({children}: {children: ReactNode}) {
    const pathname = usePathname();
    if (pathname.startsWith("/exams/courses")) return <DashboardThemeProvider><SiteFrame theme="light">{children}</SiteFrame></DashboardThemeProvider>;
    return <SiteFrame>{children}</SiteFrame>;
}
