"use client";

import type {ReactNode} from "react";
import {usePathname} from "next/navigation";
import DashboardThemeProvider from "@/src/dashboard/theme/DashboardThemeProvider";
import SiteFrame from "./SiteFrame";
import styles from "./LearnerSiteFrame.module.css";

export default function LearnerSiteFrame({children}: {children: ReactNode}) {
    const pathname = usePathname();
    if (pathname.startsWith("/exams/courses")) return <DashboardThemeProvider><div className={styles.coursesFrame}><SiteFrame>{children}</SiteFrame></div></DashboardThemeProvider>;
    return <SiteFrame>{children}</SiteFrame>;
}
