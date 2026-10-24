"use client";

import {useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode} from "react";
import Image from "next/image";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {MonitorPlay} from "@phosphor-icons/react/dist/csr/MonitorPlay";
import {FileText} from "@phosphor-icons/react/dist/csr/FileText";
import {ClockCounterClockwise} from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import {ArrowLeft} from "@phosphor-icons/react/dist/csr/ArrowLeft";
import {List} from "@phosphor-icons/react/dist/csr/List";
import {X} from "@phosphor-icons/react/dist/csr/X";
import {House} from "@phosphor-icons/react/dist/csr/House";
import {usePortalAuth} from "../platform/auth/PortalAuthProvider";
import {canAccessStaffSimulator} from "../simulator/feature";
import AppearanceMenu from "../dashboard/theme/AppearanceMenu";
import {AuthNavigation} from "../marketing/SiteHeader";
import styles from "./SweatboxWorkspace.module.css";

const trainerLinks = [
  {key: "sessions", href: "/sweatbox/staff", label: "Sessions", Icon: MonitorPlay},
  {key: "scenarios", href: "/sweatbox/scenarios", label: "Scenarios", Icon: FileText},
  {key: "replays", href: "/sweatbox/replays", label: "Replays", Icon: ClockCounterClockwise},
] as const;
const menteeLink = {key: "mentee", href: "/sweatbox/mentee", label: "Your sweatbox", Icon: House} as const;
const mobileQuery = "(max-width: 760px)";
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;

function Brand({href}: {href: string}) {
  return <Link href={href} className={styles.brand} aria-label="ATCMH Sweatbox"><Image src="/assets/logo-Czz1Kl8u.png" width={38} height={42} alt=""/><span><strong>ATCMH</strong><small>Sweatbox</small></span></Link>;
}

export default function SweatboxWorkspace({children}: {children: ReactNode}) {
  const pathname = usePathname(), menuId = useId();
  const [open, setOpen] = useState(false);
  const mobile = useSyncExternalStore(subscribe, mobileSnapshot, () => false);
  const trigger = useRef<HTMLButtonElement>(null);
  // Mentees admitted by an assignment see only their own page; trainers keep the library and gain Your sweatbox.
  const trainer = canAccessStaffSimulator(usePortalAuth().adminUser);
  const links = trainer ? [...trainerLinks, menteeLink] : [menteeLink], home = trainer ? "/sweatbox/staff" : "/sweatbox/mentee";
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {if (event.key === "Escape") {setOpen(false); trigger.current?.focus();}};
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);
  return <div className={styles.workspace}>
    <a className={styles.skip} href="#learning-content" onClick={() => setOpen(false)}>Skip to content</a>
    <header className={styles.mobileHeader}>
      <Brand href={home}/>
      <div className={styles.mobileActions}><AppearanceMenu/><div className={styles.account}><AuthNavigation showLogin={false}/></div><button ref={trigger} className={styles.menuButton} data-simulator-tour="library-navigation" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => !value)}>{open ? <X size={22}/> : <List size={22}/>}</button></div>
    </header>
    {mobile && open ? <button className={styles.backdrop} tabIndex={-1} aria-label="Close navigation" onClick={() => {setOpen(false); trigger.current?.focus();}}/> : null}
    <aside id={menuId} className={styles.sidebar} data-open={open}>
      <div className={styles.desktopBrand}><Brand href={home}/></div>
      <nav aria-label="Sweatbox library">{links.map(({key, href, label, Icon}) => <Link key={key} href={href} data-simulator-tour={`${key}-tab`} aria-current={pathname.startsWith(href) ? "page" : undefined} onClick={() => setOpen(false)}><Icon size={24} aria-hidden="true"/><span>{label}</span></Link>)}</nav>
      <div className={styles.sidebarFooter}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full navigation restores the main site's restrictive media CSP. */}
        <a className={styles.backLink} href="/"><ArrowLeft size={20} aria-hidden="true"/>Back to ATCMH</a>
        <div className={styles.desktopAccount}><AppearanceMenu/><div className={styles.account}><AuthNavigation showLogin={false}/></div></div>
      </div>
    </aside>
    <div className={styles.content} id="learning-content" tabIndex={-1} inert={mobile && open}>{children}</div>
  </div>;
}
