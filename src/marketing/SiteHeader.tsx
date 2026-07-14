"use client";

import {useEffect, useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {homeLoginHref} from "@/src/platform/auth/login-routing";
import {headerAuthState} from "@/src/platform/auth/header-state";

export const discordUrl = "https://discord.gg/P3kcYbzTBU";

const marketingNavLinks = [
  {label: "About", href: "/#about"},
  {label: "Services", href: "/#services"},
  {label: "Eligibility", href: "/#eligibility"},
  {label: "Leaderboard", href: "/leaderboard"},
  {label: "Exam Center", href: "/exams"},
];

function UserMenu({showDashboard, onLogout}: {showDashboard: boolean; onLogout: () => void}) {
  return <details className="nav-user-menu">
    <summary aria-label="Open account menu">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2.25c-4.56 0-8.25 2.02-8.25 4.5V21h16.5v-2.25c0-2.48-3.69-4.5-8.25-4.5Z"/></svg>
    </summary>
    <div className="nav-user-menu-content">
      <Link href="/account">Account</Link>
      {showDashboard ? <Link href="/dashboard">Dashboard</Link> : null}
      <button type="button" onClick={onLogout}>Log out</button>
    </div>
  </details>;
}

function AuthNavigation({showLogin}: {showLogin: boolean}) {
  const {session, adminUser, loading, error, logout} = usePortalAuth();
  const state = headerAuthState({loading, hasDashboardSession: Boolean(session), hasAdminPermission: Boolean(adminUser), dashboardUnavailable: Boolean(error), hasExamsSession: false});
  if (state === "loading") return <span className="nav-auth-loading" aria-label="Checking account"/>;
  if (state === "signed-out" || state === "unavailable" || state === "exams-only") return showLogin && state !== "exams-only" ? <Link className="nav-login" href={homeLoginHref("dashboard", "/")}>Login</Link> : null;
  return <UserMenu showDashboard={state === "admin"} onLogout={() => void logout(false)}/>;
}

function NavigationLinks() {
  const pathname = usePathname();
  return <>{marketingNavLinks.map(link => {
    const active = link.href === "/exams" ? pathname.startsWith("/exams") : pathname === link.href;
    return <Link key={link.label} href={link.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>{link.label}</Link>;
  })}</>;
}

export function SiteHeader({variant = "hero", showLogin = false}: {variant?: "hero" | "solid"; showLogin?: boolean}) {
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
    <nav className="nav-links" aria-label="Primary navigation"><NavigationLinks/></nav>
    <div className="nav-primary-auth"><AuthNavigation showLogin={showLogin}/></div>
    <details className="mobile-navigation">
      <summary aria-label="Open navigation">Menu</summary>
      <nav aria-label="Mobile navigation"><NavigationLinks/><AuthNavigation showLogin={showLogin}/></nav>
    </details>
  </header>;
}
