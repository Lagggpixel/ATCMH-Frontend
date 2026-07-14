"use client";

import type {ReactNode} from "react";
import {useEffect} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import Link from "next/link";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {homeLoginHref} from "@/src/platform/auth/login-routing";

export default function DashboardAccessGate({children}: {children: ReactNode}) {
  const {session, adminUser, loading, error} = usePortalAuth();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const returnTo = `${pathname}${search ? `?${search}` : ""}`;

  useEffect(() => {
    if (!loading && !session) router.replace(homeLoginHref("dashboard", returnTo));
  }, [loading, returnTo, router, session]);

  if (loading || !session) return <main className="platform-state"><span className="platform-spinner"/><p>Checking Dashboard access…</p></main>;
  if (error) return <main className="platform-state"><p className="platform-eyebrow">Dashboard unavailable</p><h1>We could not verify your permissions</h1><p>Try again shortly or return to the home page.</p><Link className="platform-button" href="/">Return home</Link></main>;
  if (!adminUser) return <main className="platform-state"><p className="platform-eyebrow">403 · Access denied</p><h1>This account cannot access the Dashboard</h1><p>Your account is signed in, but it does not have an authorized staff role.</p><Link className="platform-button" href="/">Return home</Link></main>;
  return children;
}
