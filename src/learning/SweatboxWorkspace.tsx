"use client";

import type {ReactNode} from "react";
import Image from "next/image";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {MonitorPlay} from "@phosphor-icons/react/dist/csr/MonitorPlay";
import {FileText} from "@phosphor-icons/react/dist/csr/FileText";
import {ClockCounterClockwise} from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import {House} from "@phosphor-icons/react/dist/csr/House";
import {UserCircle} from "@phosphor-icons/react/dist/csr/UserCircle";
import {usePortalAuth} from "../platform/auth/PortalAuthProvider";
import {canAccessStaffSimulator} from "../simulator/feature";
import AppearanceMenu from "../dashboard/theme/AppearanceMenu";
import {AuthNavigation} from "../marketing/SiteHeader";
import styles from "./SweatboxWorkspace.module.css";

const trainerLinks = [
  {key: "home", href: "/sweatbox", label: "Home", Icon: House, exact: true},
  {key: "sessions", href: "/sweatbox/staff", label: "Sessions", Icon: MonitorPlay, exact: false},
  {key: "scenarios", href: "/sweatbox/scenarios", label: "Scenarios", Icon: FileText, exact: false},
  {key: "replays", href: "/sweatbox/replays", label: "Replays", Icon: ClockCounterClockwise, exact: false},
  {key: "mentee", href: "/sweatbox/mentee", label: "Your sweatbox", Icon: UserCircle, exact: true},
] as const;
const menteeLinks = [
  {key: "mentee", href: "/sweatbox/mentee", label: "Your sweatbox", Icon: House, exact: true},
  {key: "mentee-replays", href: "/sweatbox/mentee/replays", label: "Your replays", Icon: ClockCounterClockwise, exact: false},
] as const;
const normalise = (path: string) => path.replace(/^\/simulator(?=\/|$)/, "/sweatbox").replace(/\/$/, "") || "/";

function Brand({href}: {href: string}) {
  return <Link href={href} className={styles.brand} aria-label="ATCMH Sweatbox home"><Image src="/assets/logo-Czz1Kl8u.png" width={36} height={40} alt=""/><span><strong>ATCMH</strong><small>Sweatbox</small></span></Link>;
}

/** Top bar on wider screens; on phones the same links become a bottom tab bar. */
export default function SweatboxWorkspace({children}: {children: ReactNode}) {
  const pathname = normalise(usePathname());
  // Mentees admitted by an assignment see only their own pages; Mentors keep the library and gain Your sweatbox.
  const trainer = canAccessStaffSimulator(usePortalAuth().adminUser);
  const links = trainer ? trainerLinks : menteeLinks, home = trainer ? "/sweatbox" : "/sweatbox/mentee";
  return <div className={styles.workspace} data-mentee={!trainer || undefined}>
    <a className={styles.skip} href="#learning-content">Skip to content</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Brand href={home}/>
        <nav className={styles.nav} aria-label="Sweatbox" data-simulator-tour="library-navigation">{links.map(({key, href, label, Icon, exact}) => {
          const current = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={key} href={href} data-simulator-tour={`${key}-tab`} aria-current={current ? "page" : undefined}><Icon size={22} aria-hidden="true"/><span>{label}</span></Link>;
        })}</nav>
        <div className={styles.actions}>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full navigation restores the main site's restrictive media CSP. */}
          <a className={styles.backLink} href="/">Back to ATCMH</a>
          <AppearanceMenu/>
          <div className={styles.account}><AuthNavigation showLogin={false}/></div>
        </div>
      </div>
    </header>
    <div className={styles.content} id="learning-content" tabIndex={-1}>{children}</div>
  </div>;
}
