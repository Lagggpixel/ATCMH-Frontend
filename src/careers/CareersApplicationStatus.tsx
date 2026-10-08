"use client";

import Link from "next/link";
import {useEffect, useState, type ReactNode} from "react";
import {ClockIcon, CheckCircleIcon, ArrowRightIcon, XCircleIcon, CaretDownIcon} from "@phosphor-icons/react";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {homeLoginHref} from "@/src/platform/auth/login-routing";
import {ApiUtils} from "@/src/dashboard/utils/ApiUtils";
import type {MentorApplicationDetail} from "@/src/dashboard/types/MentorApplication";
import {ApplicationAnswers, ApplicationStatus, applicationDate} from "@/src/dashboard/components/admin/MentorApplicationReview";
import styles from "./CareersApplicationStatus.module.css";

export function CareersApplicationStatus({applications, now}: {applications: MentorApplicationDetail[]; now: number}) {
    const latest = applications[0];
    if (!latest) return <main className={styles.page}><p className={styles.eyebrow}>Careers</p><h1>Your mentor applications</h1><section className={styles.state}><h2>No applications yet</h2><p>Review the role expectations and apply when you are ready.</p><Link className={styles.primary} href="/careers?view=expectations">View the role <ArrowRightIcon size={18}/></Link></section></main>;
    const eligible = latest.status === "DENIED" && latest.reapplyAt != null && new Date(latest.reapplyAt).getTime() <= now;
    const copy = {
        PENDING: ["Your application is pending", "We have received your application. Mentor intake follows mentee demand, so a wait does not mean your application has been denied."],
        APPROVED: ["You’re through to the next stage", "Your application has been approved for the next selection stage. Your status will update once your Discord Mentor role is confirmed."],
        DENIED: ["Your application was denied", eligible ? "You can submit a new application. Your previous attempts will remain available below." : "You can apply again after the waiting period shown below."],
        MENTOR: ["You’re now a mentor", "Your Discord Mentor role has been confirmed. Thank you for supporting the ATCMH community."],
    }[latest.status];
    const Icon = latest.status === "PENDING" ? ClockIcon : latest.status === "DENIED" ? XCircleIcon : CheckCircleIcon;
    return <main className={styles.page}>
        <header className={styles.header}><div><p className={styles.eyebrow}>Careers</p><h1>Your mentor application</h1></div><Link href="/careers?view=expectations">Role expectations</Link></header>
        <section className={styles.state} aria-labelledby="application-status-heading">
            <div className={styles.stateHeading}><span className={styles.stateIcon} data-status={latest.status}><Icon size={28}/></span><ApplicationStatus status={latest.status}/></div>
            <h2 id="application-status-heading">{copy[0]}</h2><p className={styles.message}>{copy[1]}</p>
            <dl className={styles.metadata}><div><dt>Applicant</dt><dd>{latest.ifcUsername}</dd></div><div><dt>Submitted</dt><dd>{applicationDate(latest.submittedAt)}</dd></div>{latest.reviewedAt && <div><dt>Decision</dt><dd>{applicationDate(latest.reviewedAt)}</dd></div>}{latest.status === "DENIED" && <div><dt>{eligible ? "Waiting period ended" : "Can reapply from"}</dt><dd>{applicationDate(latest.reapplyAt, true)}</dd></div>}</dl>
            {latest.decisionReason && <section className={styles.reason}><h3>Feedback on your application</h3><p>{latest.decisionReason}</p></section>}
            {eligible && <Link className={styles.primary} href="/careers/apply">Apply again <ArrowRightIcon size={18}/></Link>}
        </section>
        <section className={styles.attempts} aria-labelledby="attempts-heading"><header><h2 id="attempts-heading">Application history</h2><span>{applications.length} {applications.length === 1 ? "attempt" : "attempts"}</span></header>
            {applications.map((a,index) => <details key={a.id} className={styles.attempt}><summary><span><strong>Attempt {applications.length-index}</strong><small>Submitted {applicationDate(a.submittedAt)}{index === 0 ? " · Latest" : ""}</small></span><span className={styles.attemptActions}><ApplicationStatus status={a.status}/><CaretDownIcon className={styles.chevron} size={18}/></span></summary><div className={styles.attemptBody}>
                <dl className={styles.metadata}><div><dt>IFC username</dt><dd>{a.ifcUsername}</dd></div><div><dt>Discord</dt><dd>{a.discord}</dd></div><div><dt>IFATC rank</dt><dd>{a.ifatcRank}</dd></div><div><dt>Region</dt><dd>{a.region}</dd></div><div><dt>Timezone</dt><dd>{a.timezone}</dd></div></dl>
                <ApplicationAnswers application={a}/>{a.reviewedAt && <p className={styles.decisionDate}>Decision: {applicationDate(a.reviewedAt, true)}</p>}{a.decisionReason && <section className={styles.reason}><h3>Feedback on your application</h3><p>{a.decisionReason}</p></section>}
            </div></details>)}
        </section>
    </main>;
}

export default function CareersApplicationGate({children, showExpectations = false}: {children?: ReactNode; showExpectations?: boolean}) {
    const {session, loading} = usePortalAuth();
    const [result, setResult] = useState<{accountId: string; applications?: MentorApplicationDetail[]; error?: string; now: number}>();
    const [refresh, setRefresh] = useState(0);
    const applications = result?.accountId === session?.accountId ? result?.applications : undefined;
    const error = result?.accountId === session?.accountId ? result?.error : undefined;
    useEffect(() => {
        if (!session || showExpectations) return;
        let current = true;
        void ApiUtils.getMyMentorApplications().then(value => {if (current) setResult({accountId: session.accountId, applications:value, now:Date.now()});})
            .catch(reason => {if (current) setResult({accountId:session.accountId, now:Date.now(), error:reason instanceof Error ? reason.message : String(reason)});});
        return () => {current = false;};
    }, [session, showExpectations, refresh]);
    if (showExpectations) return <>{children}{session && <div className={styles.returnLink}><Link href="/careers/application">View your applications <ArrowRightIcon size={16}/></Link></div>}</>;
    if (loading || (session && !applications && !error)) return <main className={styles.page}><p role="status">Loading your application…</p></main>;
    if (!session) return children ?? <main className={styles.page}><h1>Your mentor applications</h1><section className={styles.state}><h2>Sign in to view your applications</h2><Link className={styles.primary} href={homeLoginHref("dashboard", "/careers/application")}>Sign in</Link></section></main>;
    if (error) return <main className={styles.page}><h1>Your mentor applications</h1><p role="alert">{error}</p><button className={styles.primary} onClick={() => setRefresh(value => value + 1)}>Try again</button></main>;
    if (applications?.length === 0 && children) return children;
    return <CareersApplicationStatus applications={applications ?? []} now={result?.now ?? 0}/>;
}
