"use client";

import Link from "next/link";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {AuthNavigation} from "@/src/marketing/SiteHeader";
import AdminNav from "./components/admin/AdminNav";
import styles from "./DashboardHeader.module.css";

export default function DashboardHeader() {
    const {adminUser} = usePortalAuth();

    return <header className={`site-header is-scrolled is-solid ${styles.dashboardHeader}`}>
        <Link className={styles.backButton} href="/" aria-label="Back to main site">
            <span aria-hidden="true">←</span>
            Back to main site
        </Link>
        <div className={styles.dashboardNavigation}>
            {adminUser ? <AdminNav adminUser={adminUser} embedded/> : null}
        </div>
        <div className={`nav-primary-auth ${styles.accountNavigation}`}><AuthNavigation showLogin={false}/></div>
    </header>;
}
