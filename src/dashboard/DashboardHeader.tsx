"use client";

import Link from "next/link";
import Image from "next/image";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {AuthNavigation} from "@/src/marketing/SiteHeader";
import AdminNav from "./components/admin/AdminNav";
import styles from "./DashboardHeader.module.css";

export default function DashboardHeader() {
    const {adminUser} = usePortalAuth();

    return <header className={`site-header is-scrolled is-solid ${styles.dashboardHeader}`}>
        <Link className={styles.brandLink} href="/" aria-label="ATCMH Home">
            <Image src="/assets/logo-Czz1Kl8u.png" width={42} height={42} alt=""/>
            <span><strong>ATCMH</strong><small>ATC Mentorship Hub</small></span>
            <span className={styles.homeLabel}>Home</span>
        </Link>
        <div className={styles.dashboardNavigation}>
            {adminUser ? <AdminNav adminUser={adminUser} embedded/> : null}
        </div>
        <div className={styles.siteActions}>
            <div className={`nav-primary-auth ${styles.accountNavigation}`}><AuthNavigation showLogin={false}/></div>
        </div>
    </header>;
}
