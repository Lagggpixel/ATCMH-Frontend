"use client";

import type {ReactNode} from "react";
import Link from "next/link";
import {usePortalAuth} from "./PortalAuthProvider";
import {canAccessPilotGuide} from "./admin-preview-access";

export default function AdminPreviewGate({children}: {children: ReactNode}) {
  const {adminUser, loading, error} = usePortalAuth();
  if (loading) return <main className="section"><p>Checking access…</p></main>;
  if (error) return <main className="section"><h1>We could not verify your permissions</h1><Link href="/">Return home</Link></main>;
  if (!canAccessPilotGuide(adminUser)) return <main className="section"><h1>Access denied</h1><p>This page is currently available to moderators and administrators.</p><Link href="/">Return home</Link></main>;
  return children;
}
