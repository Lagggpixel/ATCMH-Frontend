"use client";

import {useEffect, useState, type MouseEvent} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {homeLoginHref} from "@/src/platform/auth/login-routing";
import {headerAuthState} from "@/src/platform/auth/header-state";
import AppearanceMenu from "@/src/dashboard/theme/AppearanceMenu";
import {canViewAdminPreview} from "@/src/platform/auth/admin-preview-access";
import ProfileAvatar from "@/src/platform/auth/ProfileAvatar";
import {profileDisplayName} from "@/src/platform/auth/profile-avatar";

export const discordUrl = "https://discord.gg/P3kcYbzTBU";

const marketingNavLinks = [
  {label: "About", href: "/#about"},
  {label: "Services", href: "/#services"},
  {label: "Eligibility", href: "/#eligibility"},
  {label: "Apply", href: "/apply"},
  {label: "Leaderboard", href: "/leaderboard"},
  {label: "Exam Center", href: "/exams"},
];

function UserMenu({showDashboard, showWraps, onLogout}: {showDashboard: boolean; showWraps: boolean; onLogout: () => void}) {
  const pathname = usePathname();
  const AccountLink = pathname === "/dashboard/pilot-guide" || pathname === "/pilot-guide" || pathname.startsWith("/exams/courses") ? "a" : Link;
  const {session, avatarUrl} = usePortalAuth();
  return <details className="nav-user-menu">
    <summary aria-label="Open account menu">
      <ProfileAvatar avatarUrl={avatarUrl} displayName={profileDisplayName(session)}/>
    </summary>
    <div className="nav-user-menu-content">
      <AccountLink href="/account">Account</AccountLink>
      {showWraps ? <AccountLink href="/wraps">Your wrap</AccountLink> : null}
      {showDashboard ? <AccountLink href="/dashboard">Dashboard</AccountLink> : null}
      <button type="button" onClick={onLogout}>Log out</button>
    </div>
  </details>;
}

export function AuthNavigation({showLogin}: {showLogin: boolean}) {
  const {session, adminUser, loading, error, logout} = usePortalAuth();
  const state = headerAuthState({loading, hasSession: Boolean(session), hasAdminPermission: Boolean(adminUser), dashboardUnavailable: Boolean(error)});
  if (state === "loading") return <span className="nav-auth-loading" aria-label="Checking account"/>;
  if (state === "signed-out" || state === "unavailable") return showLogin ? <Link className="nav-login" href={homeLoginHref("dashboard", "/")}>Login</Link> : null;
  return <UserMenu showDashboard={state === "admin"} showWraps={adminUser?.role === "super_admin" && session?.impersonating === false} onLogout={() => void logout(false)}/>;
}

function NavigationLinks() {
  const pathname = usePathname();
  const {adminUser, loading, error} = usePortalAuth();
  const links = !loading && !error && canViewAdminPreview(adminUser)
    ? [...marketingNavLinks, {label: "Courses", href: "/exams/courses"}, {label: "Pilot Guide", href: "/pilot-guide"}]
    : marketingNavLinks;

  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.currentTarget.closest(".mobile-navigation")?.removeAttribute("open");
    if (pathname !== "/" || !href.startsWith("/#")) return;
    const target = document.getElementById(href.slice(2));
    if (!target) return;
    event.preventDefault();
    window.history.pushState(null, "", href);
    target.scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start"});
  }

  return <>{links.map(link => {
    const active = link.href === "/exams" ? pathname.startsWith("/exams") && !pathname.startsWith("/exams/courses")
      : link.href === "/exams/courses" ? pathname.startsWith("/exams/courses") : pathname === link.href;
    if (link.href === "/pilot-guide") return <a key={link.label} href={link.href} onClick={event => navigate(event, link.href)} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>{link.label}</a>;
    return <Link key={link.label} href={link.href} onClick={event => navigate(event, link.href)} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>{link.label}</Link>;
  })}</>;
}

export function SiteHeader({variant = "hero", showLogin = false}: {variant?: "hero" | "solid"; showLogin?: boolean}) {
  const [hasScrolled, setHasScrolled] = useState(false);
  const pathname = usePathname();
  const light = pathname.startsWith("/exams/courses");
  useEffect(() => {
    if (variant === "solid") return;
    const update = () => setHasScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, {passive: true});
    return () => window.removeEventListener("scroll", update);
  }, [variant]);

  const filled = variant === "solid" || hasScrolled;
  return <header className={`site-header${filled ? " is-scrolled" : ""}${variant === "solid" ? " is-solid" : ""}${light ? " is-course" : ""}`}>
    <Link className="brand" href="/" aria-label="ATC Mentorship Hub home"><img src="/assets/logo-Czz1Kl8u.png" width={42} height={42} alt=""/><span className="light-brand-name"><strong>ATCMH</strong><small>ATC Mentorship Hub</small></span></Link>
    <nav className="nav-links" aria-label="Primary navigation"><NavigationLinks/></nav>
    {light ? <div className="course-header-appearance"><AppearanceMenu/></div> : null}
    <div className="nav-primary-auth"><AuthNavigation showLogin={showLogin}/></div>
    <details className="mobile-navigation">
      <summary aria-label="Open navigation">Menu</summary>
      <nav aria-label="Mobile navigation"><NavigationLinks/></nav>
    </details>
  </header>;
}
