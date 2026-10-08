"use client";

import {useEffect, useRef, useState, type ReactNode, type FormEvent} from "react";
import {ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon, GearSixIcon, ClockIcon} from "@phosphor-icons/react";
import type {MentorApplicationDetail, MentorApplicationPolicy, MentorApplicationSummary} from "../../types/MentorApplication";
import styles from "./AdminMentorApplications.module.css";

export function applicationDate(value: string | null, time = false) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-GB", time
        ? {day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"UTC", timeZoneName:"short"}
        : {dateStyle:"medium", timeZone:"UTC"}).format(new Date(value));
}
export function ApplicationStatus({status}: {status: MentorApplicationSummary["status"]}) {
    const label = {PENDING: "Pending", APPROVED: "Next stage", DENIED: "Denied", MENTOR: "Mentor"}[status];
    return <span className={styles.status} data-status={status}>{label}</span>;
}
export function ApplicationAnswers({application}: {application: MentorApplicationDetail}) {
    return <div className={styles.answers}>
        <section><h3>Specific availability outline</h3><p>{application.availabilityOutline}</p></section>
        <section><h3>Other leadership roles (VA, VO, etc.)</h3><p>{application.leadershipRoles || "Not provided"}</p></section>
        <section><h3>Why do you think you would be a good mentor?</h3><p>{application.whyMentor}</p></section>
        <section><h3>Anything else we should know?</h3><p>{application.anythingElse || "Not provided"}</p></section>
    </div>;
}
export function ApplicationDialog({title, children, onClose, busy}: {title: string; children: ReactNode; onClose: () => void; busy: boolean}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const element = ref.current;
        element?.showModal();
        return () => element?.close();
    }, []);
    return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={event => {event.preventDefault(); if (!busy) onClose();}}>
        <header><h2>{title}</h2><button type="button" disabled={busy} aria-label="Close" onClick={onClose}><XIcon size={20}/></button></header>
        {children}
    </dialog>;
}
export function ReapplicationSettings({application, account, policy, onClose, onSave, busy}: {
    application?: MentorApplicationDetail; policy: MentorApplicationPolicy; onClose: () => void; busy: boolean;
    account?: {name: string; waitMonths: number | null; latestApplication: MentorApplicationSummary | null};
    onSave: (months: number | null, date: string | null, all: boolean) => Promise<void>;
}) {
    const individual = application ?? account;
    const [inherit, setInherit] = useState(individual ? individual.waitMonths == null : false);
    const [months, setMonths] = useState(individual?.waitMonths ?? policy.waitMonths);
    const [date, setDate] = useState("");
    const [all, setAll] = useState(false);
    const [error, setError] = useState<string>();
    const latest = application ? [application, ...application.previousAttempts].reduce((a,b) => a.id > b.id ? a : b) : account?.latestApplication;
    const submit = async (event: FormEvent) => {
        event.preventDefault(); setError(undefined);
        try { await onSave(inherit ? null : months, date ? new Date(date).toISOString() : null, all); onClose(); }
        catch (reason) {setError(reason instanceof Error ? reason.message : String(reason));}
    };
    return <ApplicationDialog title={individual ? `Reapplication · ${application?.ifcUsername ?? account?.name}` : "Reapplication settings"} onClose={onClose} busy={busy}>
        <form onSubmit={submit}>
            <p className={styles.muted}>Waiting periods start on the denial date and use calendar months. The default is {policy.waitMonths} months.</p>
            {individual && <label className={styles.checkbox}><input type="checkbox" disabled={busy} checked={inherit} onChange={e => setInherit(e.target.checked)}/>Use the default waiting period</label>}
            <label className={styles.field}>Waiting period (months)<input type="number" min="0" max="120" step="1" required disabled={busy || inherit} value={months} onChange={e => setMonths(Number(e.target.value))}/></label>
            {latest?.status === "DENIED" && <label className={styles.field}>Override reapplication date (optional)<input type="datetime-local" value={date} disabled={busy} onChange={e => setDate(e.target.value)}/><small>Uses your local timezone. Leave blank to calculate from the waiting period. Current date: {applicationDate(latest.reapplyAt, true)}.</small></label>}
            {!individual && <label className={styles.checkbox}><input type="checkbox" checked={all} disabled={busy} onChange={e => setAll(e.target.checked)}/>Apply to all denied applicants and replace all individual overrides</label>}
            {!individual && <p className={styles.muted}>{all ? "Existing denial dates will be recalculated. Individual waiting periods will be cleared for every applicant." : "Changes apply to future denials. Existing denial dates and individual overrides are preserved."}</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            <footer><button className={styles.secondary} type="button" disabled={busy} onClick={onClose}>Cancel</button><button className={styles.primary} disabled={busy}>{busy ? "Saving…" : "Save waiting period"}</button></footer>
        </form>
    </ApplicationDialog>;
}

interface ReviewProps {
    application: MentorApplicationDetail;
    policy: MentorApplicationPolicy;
    busy: boolean;
    onBack: () => void;
    onSelect: (id: number) => void;
    previous?: number;
    next?: number;
    position: number;
    total: number;
    onDecision: (status: "APPROVED" | "DENIED", reason: string) => Promise<void>;
    onWait: (months: number | null, date: string | null) => Promise<void>;
    onPolicy: () => void;
}
export default function MentorApplicationReview({application: a, policy, busy, onBack, onSelect, previous, next, position, total, onDecision, onWait, onPolicy}: ReviewProps) {
    const [reason, setReason] = useState("");
    const [decision, setDecision] = useState<"APPROVED" | "DENIED">();
    const [waitOpen, setWaitOpen] = useState(false);
    const [error, setError] = useState<string>();
    const confirm = async (event: FormEvent) => {
        event.preventDefault(); if (!decision) return;
        setError(undefined);
        try {await onDecision(decision, reason.trim()); setDecision(undefined); setReason("");}
        catch (failure) {setError(failure instanceof Error ? failure.message : String(failure));}
    };
    return <>
        <nav className={styles.readerNav} aria-label="Application navigation">
            <button type="button" disabled={busy} onClick={onBack}><ArrowLeftIcon size={18}/>Back to applications</button>
            <div><button type="button" disabled={busy || previous == null} onClick={() => previous != null && onSelect(previous)}><ArrowLeftIcon size={16}/>Previous</button><span>{position} of {total}</span><button type="button" disabled={busy || next == null} onClick={() => next != null && onSelect(next)}>Next<ArrowRightIcon size={16}/></button></div>
        </nav>
        <div className={styles.reader}>
            <aside className={styles.identityPanel}>
                <header className={styles.applicantHeading}><h2>{a.ifcUsername}</h2><ApplicationStatus status={a.status}/></header>
                <dl className={styles.identity}>
                    <div><dt>IFC username</dt><dd>{a.ifcUsername}</dd></div>
                    <div><dt>Discord</dt><dd>{a.discord}</dd></div>
                    <div><dt>IFATC rank</dt><dd>{a.ifatcRank}</dd></div>
                    <div><dt>Region</dt><dd>{a.region}</dd></div>
                    <div><dt>Timezone</dt><dd>{a.timezone}</dd></div>
                    <div><dt>Submitted</dt><dd>{applicationDate(a.submittedAt, true)}</dd></div>
                </dl>
                <section className={styles.attendance} aria-label="Session attendance"><h3>Attendance</h3>{a.attendance ? <dl><div><dt>All time</dt><dd>{a.attendance.allTime}</dd></div><div><dt>Last 30 days</dt><dd>{a.attendance.last30Days}</dd></div></dl> : <p className={styles.muted}>Attendance is temporarily unavailable.</p>}</section>
                <details className={styles.history}><summary>Other attempts ({a.previousAttempts.length})</summary>
                    {a.previousAttempts.length ? a.previousAttempts.map(attempt => <button type="button" disabled={busy} key={attempt.id} onClick={() => onSelect(attempt.id)}><span>{applicationDate(attempt.submittedAt)}</span><ApplicationStatus status={attempt.status}/></button>) : <p className={styles.muted}>No other attempts.</p>}
                </details>
                <section className={styles.waitSection}><h3><ClockIcon size={19}/>Reapplication</h3>
                    <p>{a.waitMonths == null ? "Default wait" : "Applicant wait"}: <strong>{a.waitMonths ?? policy.waitMonths} months</strong></p>
                    {a.status === "DENIED" && <p>Can reapply: <strong>{applicationDate(a.reapplyAt, true)}</strong></p>}
                    <button className={styles.secondary} disabled={busy} type="button" onClick={() => setWaitOpen(true)}>Set applicant wait</button>
                    <button className={styles.textButton} disabled={busy} type="button" onClick={onPolicy}><GearSixIcon size={16}/>Manage default</button>
                </section>
            </aside>
            <div className={styles.responsePanel}>
                <ApplicationAnswers application={a}/>
                <section className={styles.decision}>
                    {a.status === "PENDING" || a.status === "APPROVED" ? <>
                        <h3>{a.status === "APPROVED" ? "Next selection stage" : "Decision"}</h3>
                        <p className={styles.muted}>{a.status === "APPROVED" ? "Approval advances the applicant to the next stage. They become a mentor when their Discord Mentor role is confirmed." : "Approval moves the applicant to the next selection stage."}</p>
                        {a.decisionReason && <p className={styles.savedReason}>{a.decisionReason}</p>}
                        <label className={styles.field}>Reason (visible to applicant)<textarea value={reason} maxLength={2000} rows={2} disabled={busy} onChange={e => setReason(e.target.value)} placeholder="Explain the decision…"/></label>
                        <div className={styles.decisionActions}><button type="button" className={styles.danger} disabled={busy || !reason.trim()} onClick={() => {setError(undefined); setDecision("DENIED");}}><XIcon size={17}/>Deny application</button>{a.status === "PENDING" && <button type="button" className={styles.primary} disabled={busy || !reason.trim()} onClick={() => {setError(undefined); setDecision("APPROVED");}}><CheckIcon size={18}/>Approve application</button>}</div>
                    </> : <><h3>{a.status === "MENTOR" ? "Mentor role confirmed" : "Application denied"}</h3><p className={styles.muted}>{a.status === "MENTOR" ? "This applicant has the Discord Mentor role." : `Decision made ${applicationDate(a.reviewedAt)}.`}</p>{a.decisionReason && <p className={styles.savedReason}>{a.decisionReason}</p>}</>}
                </section>
            </div>
        </div>
        {decision && <ApplicationDialog title={decision === "APPROVED" ? "Approve application?" : "Deny application?"} busy={busy} onClose={() => setDecision(undefined)}><form onSubmit={confirm}>
            <p>{decision === "APPROVED" ? `${a.ifcUsername} will move to the next selection stage. This does not grant the Mentor role.` : `${a.ifcUsername} will be able to reapply after ${a.waitMonths ?? policy.waitMonths} calendar months.`}</p><blockquote className={styles.savedReason}>{reason}</blockquote><p className={styles.muted}>The applicant can see this reason. This decision will be recorded in the audit log.</p>{error && <p role="alert" className={styles.error}>{error}</p>}
            <footer><button type="button" className={styles.secondary} disabled={busy} onClick={() => setDecision(undefined)}>Cancel</button><button className={decision === "DENIED" ? styles.danger : styles.primary} disabled={busy}>{busy ? "Saving…" : decision === "APPROVED" ? "Confirm approval" : "Confirm denial"}</button></footer>
        </form></ApplicationDialog>}
        {waitOpen && <ReapplicationSettings application={a} policy={policy} busy={busy} onClose={() => setWaitOpen(false)} onSave={(months,date) => onWait(months,date)}/>}
    </>;
}
