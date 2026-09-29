"use client";

import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import Image from "next/image";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {AuthNavigation} from "@/src/marketing/SiteHeader";
import AdminNav from "./components/admin/AdminNav";
import styles from "./DashboardHeader.module.css";

export default function DashboardHeader() {
    const {adminUser} = usePortalAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [menuOpen]);

    return <header className={`site-header is-scrolled is-solid is-light ${styles.dashboardHeader}`}>
        <Link className={styles.brandLink} href="/" aria-label="ATCMH Home">
            <Image src="/assets/logo-Czz1Kl8u.png" width={42} height={42} alt=""/>
            <span><strong>ATCMH</strong><small>ATC Mentorship Hub</small></span>
            <span className={styles.homeLabel}>Home</span>
        </Link>
        <div id="dashboard-sections" className={styles.dashboardNavigation} data-open={menuOpen} onClickCapture={event => {
            if ((event.target as Element).closest("a")) setMenuOpen(false);
        }}>
            {adminUser ? <AdminNav adminUser={adminUser} embedded/> : null}
        </div>
        {adminUser ? <button ref={menuButton} type="button" className={styles.mobileMenuButton} aria-controls="dashboard-sections" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? "Close" : "Menu"}</button> : null}
        <div className={styles.siteActions}>
            <div className={`nav-primary-auth ${styles.accountNavigation}`}><AuthNavigation showLogin={false}/></div>
        </div>
    </header>;
}
