"use client";

import {type ReactNode, useEffect, useState} from "react";
import Link from "next/link";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {homeLoginHref} from "@/src/platform/auth/login-routing";
import {headerAuthState} from "@/src/platform/auth/header-state";

export const discordUrl = "https://discord.gg/P3kcYbzTBU";

const navLinks = [
  {label: "About", href: "/#about"},
  {label: "Services", href: "/#services"},
  {label: "Eligibility", href: "/#eligibility"},
  {label: "Leaderboard", href: "/leaderboard"},
  {label: "Exam Center", href: "/exams"},
];

function AuthNavigation({showLogin, accessory}: {showLogin: boolean; accessory?: ReactNode}) {
  const {session, adminUser, loading, error, logout} = usePortalAuth();
  const state = headerAuthState({loading, hasDashboardSession: Boolean(session), hasAdminPermission: Boolean(adminUser), dashboardUnavailable: Boolean(error), hasExamsSession: Boolean(accessory)});
  if (state === "loading") return <>{accessory}<span className="nav-auth-loading" aria-label="Checking account"/></>;
  if (state === "signed-out" || state === "unavailable" || state === "exams-only") return <>{accessory}{showLogin && state !== "exams-only" ? <Link className="nav-login" href={homeLoginHref("dashboard", "/")}>Login</Link> : null}</>;
  return <div className="nav-account-links">
    {accessory}
    <Link href="/account">Account</Link>
    {adminUser ? <Link className="nav-dashboard" href="/dashboard">Dashboard</Link> : null}
    <button type="button" onClick={() => void logout(false)}>Log out</button>
  </div>;
}

function NavigationLinks() {
  return <>
    {navLinks.map(link => <Link key={link.label} href={link.href}>{link.label}</Link>)}
    <a href={discordUrl} target="_blank" rel="noopener noreferrer">Contact</a>
    <details className="nav-dropdown">
      <summary>Legal</summary>
      <div className="nav-dropdown-menu"><Link href="/policy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></div>
    </details>
  </>;
}

export function SiteHeader({variant = "hero", showLogin = false, accountAccessory}: {variant?: "hero" | "solid"; showLogin?: boolean; accountAccessory?: ReactNode}) {
  const [hasScrolled, setHasScrolled] = useState(false);
  useEffect(() => {
    if (variant === "solid") return;
    const update = () => setHasScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, {passive: true});
    return () => window.removeEventListener("scroll", update);
  }, [variant]);

  const filled = variant === "solid" || hasScrolled;
  return <header className={`site-header${filled ? " is-scrolled" : ""}${variant === "solid" ? " is-solid" : ""}`}>
    <Link className="brand" href="/" aria-label="ATC Mentorship Hub home"><img src="/assets/logoLight-DWbJHT7m.png" alt="ATCMH"/></Link>
    <nav className="nav-links" aria-label="Primary navigation"><NavigationLinks/><AuthNavigation showLogin={showLogin} accessory={accountAccessory}/></nav>
    <a className="nav-cta" href={discordUrl} target="_blank" rel="noopener noreferrer">Enroll Now</a>
    <details className="mobile-navigation">
      <summary aria-label="Open navigation">Menu</summary>
      <nav aria-label="Mobile navigation"><NavigationLinks/><AuthNavigation showLogin={showLogin} accessory={accountAccessory}/></nav>
    </details>
  </header>;
}
