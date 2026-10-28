"use client";

import type {ReactNode} from "react";
import Image from "next/image";
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
import ChangelogNotice from "../simulator/changelog/ChangelogNotice";
import {CHANGELOG_PATH} from "../simulator/changelog/changelog";
import styles from "./SweatboxWorkspace.module.css";

const trainerLinks = [
  // Sessions is the Sweatbox home; /sweatbox/staff shows the same page.
  {key: "sessions", href: "/sweatbox", label: "Sessions", Icon: MonitorPlay, exact: true, also: "/sweatbox/staff"},
  {key: "scenarios", href: "/sweatbox/scenarios", label: "Scenarios", Icon: FileText, exact: false},
  {key: "replays", href: "/sweatbox/replays", label: "Replays", Icon: ClockCounterClockwise, exact: false},
  {key: "mentee", href: "/sweatbox/mentee", label: "Your sweatbox", Icon: UserCircle, exact: true},
] as const satisfies readonly NavLink[];
const menteeLinks = [
  {key: "mentee", href: "/sweatbox/mentee", label: "Your sweatbox", Icon: House, exact: true},
  {key: "mentee-replays", href: "/sweatbox/mentee/replays", label: "Your replays", Icon: ClockCounterClockwise, exact: false},
] as const satisfies readonly NavLink[];
interface NavLink {key: string; href: string; label: string; Icon: typeof House; exact: boolean; also?: string}
const normalise = (path: string) => path.replace(/^\/simulator(?=\/|$)/, "/sweatbox").replace(/\/$/, "") || "/";

function Brand({href}: {href: string}) {
  return <a href={href} className={styles.brand} aria-label="ATCMH Sweatbox home"><Image src="/assets/logo-Czz1Kl8u.png" width={28} height={31} alt=""/><strong>ATCMH Sweatbox</strong></a>;
}

/** One slim top bar on wider screens; on phones the same links become a bottom tab bar. */
export default function SweatboxWorkspace({children}: {children: ReactNode}) {
  const pathname = normalise(usePathname());
  // Mentees admitted by an assignment see only their own pages; Mentors keep the library and gain Your sweatbox.
  const {adminUser, session} = usePortalAuth(), trainer = canAccessStaffSimulator(adminUser);
  const links = trainer ? trainerLinks : menteeLinks, home = trainer ? "/sweatbox" : "/sweatbox/mentee";
  return <div className={styles.workspace} data-mentee={!trainer || undefined}>
    <a className={styles.skip} href="#learning-content">Skip to content</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Brand href={home}/>
        {/* Full navigation avoids WebKit's status-bar regression on client-side page changes. */}
        <nav className={styles.nav} aria-label="Sweatbox" data-simulator-tour="library-navigation">{(links as readonly NavLink[]).map(({key, href, label, Icon, exact, also}) => {
          const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
          const current = (exact ? pathname === href : under(href)) || (!!also && under(also));
          return <a key={key} href={href} data-simulator-tour={`${key}-tab`} aria-current={current ? "page" : undefined}><Icon size={22} aria-hidden="true"/><span>{label}</span></a>;
        })}</nav>
        <div className={styles.actions}>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full navigation restores the main site's restrictive media CSP. */}
          <a className={styles.backLink} href="/">Back to ATCMH</a>
          <AppearanceMenu/>
          <div className={styles.account}><AuthNavigation showLogin={false} menuLinks={trainer ? [{href: CHANGELOG_PATH, label: "Changelog"}] : undefined}/></div>
        </div>
      </div>
    </header>
    <div className={styles.content} id="learning-content" tabIndex={-1}>{children}</div>
    {/* Ground & Tower updates for mentors; mentees never receive this dialog. */}
    {trainer && session ? <ChangelogNotice key={session.accountId} accountId={session.accountId}/> : null}
  </div>;
}
