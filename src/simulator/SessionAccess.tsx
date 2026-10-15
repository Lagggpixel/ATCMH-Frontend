"use client";
import TrainerNotice from "./TrainerNotice";
import {useEffect, useState, type ReactNode} from "react";
import Link from "next/link";
import {usePortalAuth} from "../platform/auth/PortalAuthProvider";
import {homeLoginHref} from "../platform/auth/login-routing";
import {canAccessStaffSimulator} from "./feature";
import type {SessionRole} from "./sessions";
import styles from "./Sessions.module.css";

export function SessionNotice({title, children, embedded = false}: {title: string; children?: ReactNode; embedded?: boolean}) {
  return <main className={`${styles.notice} ${embedded ? styles.embeddedNotice : ""}`}>{!embedded ? <Link href="/" className={styles.brand}>ATCMH <span>/ ATC Trainer</span></Link> : null}<section><h1>{title}</h1>{children}</section><footer><TrainerNotice/></footer></main>;
}
export default function SessionAccess({returnTo, children, embedded = false}: {role: SessionRole; returnTo: string; children: (csrf: string, accountId: string) => ReactNode; embedded?: boolean}) {
  const {session, adminUser, loading, error} = usePortalAuth();
  const [csrf, setCsrf] = useState(""), [failure, setFailure] = useState("");
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    fetch("/exams/api/auth/session", {cache: "no-store", signal: controller.signal}).then(r => r.json()).then(value => {
      if (!value.session?.csrfToken || value.session.accountId !== session.accountId) throw new Error("Your sign-in could not be verified. Refresh and try again.");
      setCsrf(value.session.csrfToken);
    }).catch(reason => {if (!controller.signal.aborted) setFailure(reason.message);});
    return () => controller.abort();
  }, [session]);
  if (loading) return <SessionNotice embedded={embedded} title="Checking access…"/>;
  if (!session) return <SessionNotice embedded={embedded} title="Join the ATC simulator"><Link className={styles.primary} href={homeLoginHref("dashboard", returnTo)}>Sign in</Link></SessionNotice>;
  if (error || !canAccessStaffSimulator(adminUser)) return <SessionNotice embedded={embedded} title="Simulator access required"><p>{error || "The simulator is available to staff, administrators and Simulator Testers."}</p><Link href="/">Return home</Link></SessionNotice>;
  if (failure) return <SessionNotice embedded={embedded} title="Could not verify sign-in"><p>{failure}</p><button onClick={() => window.location.reload()}>Try again</button></SessionNotice>;
  if (!csrf) return <SessionNotice embedded={embedded} title="Opening simulator…"/>;
  return children(csrf, session.accountId);
}
