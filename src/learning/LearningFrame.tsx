"use client";

import type {ReactNode} from "react";
import Image from "next/image";
import {ArrowLeftIcon} from "@phosphor-icons/react/ArrowLeft";
import DashboardThemeProvider from "@/src/dashboard/theme/DashboardThemeProvider";
import AppearanceMenu from "@/src/dashboard/theme/AppearanceMenu";
import {AuthNavigation} from "@/src/marketing/SiteHeader";
import styles from "./LearningFrame.module.css";

export default function LearningFrame({product, children}: {product: "Courses" | "Pilot Guide"; children: ReactNode}) {
    return <DashboardThemeProvider><div className={styles.frame} data-learning-product={product}>
        <a className={styles.skipLink} href="#learning-content">Skip to content</a>
        <header className={styles.header}>
            <div className={styles.headerInner}>
                <div className={styles.brand} aria-label={`ATCMH ${product}`}>
                    <Image src="/assets/logo-Czz1Kl8u.png" width={44} height={48} alt=""/>
                    <span><strong>ATCMH</strong><small>{product}</small></span>
                </div>
                <div className={styles.actions}>
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full navigation restores the main site's restrictive media CSP. */}
                    <a className={styles.backLink} href="/" aria-label="Back to ATCMH" title="Back to ATCMH"><ArrowLeftIcon size={20}/><span>Back to ATCMH</span></a>
                    <AppearanceMenu/>
                    <div className={styles.accountNavigation}><AuthNavigation showLogin={false}/></div>
                </div>
            </div>
        </header>
        <div className={styles.content} id="learning-content" tabIndex={-1}>{children}</div>
    </div></DashboardThemeProvider>;
}
