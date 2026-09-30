"use client";

import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import Image from "next/image";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {AuthNavigation} from "@/src/marketing/SiteHeader";
import AdminNav from "./components/admin/AdminNav";
import styles from "./DashboardHeader.module.css";
import AppearanceMenu from "./theme/AppearanceMenu";

export default function DashboardHeader() {
    const {adminUser} = usePortalAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuButton = useRef<HTMLButtonElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const drawer = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        closeButton.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
            if (event.key === "Tab" && drawer.current) {
                const focusable = [...drawer.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", onKeyDown);
        return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; };
    }, [menuOpen]);

    return <header className={`site-header is-scrolled is-solid is-light ${styles.dashboardHeader}`}>
        <Link className={styles.brandLink} href="/" aria-label="ATCMH Home">
            <Image src="/assets/logo-Czz1Kl8u.png" width={42} height={42} alt=""/>
            <span><strong>ATCMH</strong><small>ATC Mentorship Hub</small></span>
            <span className={styles.homeLabel}>Home</span>
        </Link>
        {menuOpen ? <button type="button" className={styles.drawerBackdrop} aria-label="Close dashboard menu" onClick={() => {setMenuOpen(false); menuButton.current?.focus();}}/> : null}
        <div ref={drawer} id="dashboard-sections" className={styles.dashboardNavigation} data-open={menuOpen} role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen ? "true" : undefined} aria-label={menuOpen ? "Dashboard navigation" : undefined}>
            <div className={styles.drawerHeader}>
                <Link className={styles.brandLink} href="/" onClick={() => setMenuOpen(false)} aria-label="ATCMH Home">
                    <Image src="/assets/logo-Czz1Kl8u.png" width={42} height={42} alt=""/>
                    <span><strong>ATCMH</strong><small>ATC Mentorship Hub</small></span>
                </Link>
                <button ref={closeButton} type="button" onClick={() => {setMenuOpen(false); menuButton.current?.focus();}}>Close</button>
            </div>
            {adminUser ? <AdminNav adminUser={adminUser} embedded onNavigate={() => setMenuOpen(false)}/> : null}
        </div>
        {adminUser ? <button ref={menuButton} type="button" className={styles.mobileMenuButton} aria-controls="dashboard-sections" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>Menu</button> : null}
        <div className={styles.siteActions}>
            <AppearanceMenu/>
            <div className={`nav-primary-auth ${styles.accountNavigation}`}><AuthNavigation showLogin={false}/></div>
        </div>
    </header>;
}
