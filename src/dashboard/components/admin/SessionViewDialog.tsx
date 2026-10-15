"use client";

import {useEffect, useRef, useState} from "react";
import {X, Trash} from "@phosphor-icons/react";
import type {Session} from "../../types/Session";
import SessionTimeDisplay from "./SessionTimeDisplay";
import SessionFeedbackPanel from "./SessionFeedbackPanel";
import styles from "./SessionViewDialog.module.css";

export default function SessionViewDialog({session, getUserName, canGenerate, token, onClose, onCancelSession, onSessionChanged}: {
    session: Session;
    getUserName: (id: string) => string;
    canGenerate: boolean;
    token?: string | null;
    onClose: () => void;
    onCancelSession?: () => Promise<Session | undefined>;
    onSessionChanged: (session: Session) => void;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const confirmationRef = useRef<HTMLDialogElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const submitting = useRef(false);
    const [tab, setTab] = useState<"feedback" | "attendees">("feedback");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const dialog = dialogRef.current;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialog?.showModal();
        return () => {
            dialog?.close();
            document.body.style.overflow = previousOverflow;
            if (opener?.isConnected) opener.focus();
        };
    }, []);

    useEffect(() => {
        if (busy) return;
        if (confirmationRef.current?.open) {
            confirmationRef.current.querySelector<HTMLButtonElement>("button")?.focus();
        } else if (session.cancelled) {
            dialogRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Close session details"]')?.focus();
        }
    }, [busy, session.cancelled]);

    const dismissConfirmation = () => {
        if (submitting.current) return;
        confirmationRef.current?.close();
        cancelButtonRef.current?.focus();
    };

    const cancelSession = async () => {
        if (submitting.current || session.cancelled || !onCancelSession || !confirmationRef.current?.open) return;
        submitting.current = true;
        setBusy(true);
        setError(undefined);
        try {
            const updated = await onCancelSession();
            if (!updated) throw new Error();
            confirmationRef.current?.close();
            onSessionChanged(updated);
        } catch {
            setError("The session could not be cancelled. Please try again.");
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    };

    const status = session.cancelled
        ? session.retainAttendance ? "Not held · attendance retained" : "Cancelled"
        : new Date(session.time).getTime() >= Date.now() ? "Upcoming" : "Past";

    return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="session-view-title"
        onCancel={event => {event.preventDefault(); if (!submitting.current) onClose();}}>
        <header className={styles.header}>
            <div><p className={styles.eyebrow}>Session #{session.id}</p><h2 id="session-view-title">Session details</h2></div>
            <span className={styles.status} data-cancelled={session.cancelled}>{status}</span>
            <button type="button" className={styles.iconButton} aria-label="Close session details" onClick={onClose} disabled={busy}><X size={22}/></button>
        </header>
        <dl className={styles.summary}>
            <div><dt>Airport</dt><dd className={styles.airport}>{session.airport || "Not set"}</dd></div>
            <div className={styles.time}><dt>Date &amp; time (UTC)</dt><dd><SessionTimeDisplay value={session.time}/></dd></div>
            <div><dt>Mentor</dt><dd>{getUserName(session.mentor)}</dd></div>
            <div><dt>Mentee</dt><dd>{getUserName(session.mentee)}</dd></div>
            <div><dt>Requested pilots</dt><dd>{session.pilots}</dd></div>
        </dl>
        <div className={styles.tabs} role="tablist" aria-label="Session information">
            {(["feedback", "attendees"] as const).map(value => <button key={value} type="button" role="tab"
                id={`session-${value}-tab`} aria-controls={`session-${value}-panel`} aria-selected={tab === value}
                tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
                onKeyDown={event => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const next = event.key === "Home" ? "feedback" : event.key === "End" ? "attendees" : value === "feedback" ? "attendees" : "feedback";
                    setTab(next);
                    dialogRef.current?.querySelector<HTMLButtonElement>(`#session-${next}-tab`)?.focus();
                }}>
                {value === "feedback" ? "Feedback" : `Attendees (${session.attendees.length})`}
            </button>)}
        </div>
        <div className={styles.content}>
            <div role="tabpanel" id="session-feedback-panel" aria-labelledby="session-feedback-tab" hidden={tab !== "feedback"} tabIndex={0}>
                <SessionFeedbackPanel hideHeading sessionId={session.id} canGenerate={canGenerate} canMarkNotHeld={!session.cancelled}
                    token={token} outcome={session.trainingOutcome} onOutcomeChanged={onSessionChanged}/>
            </div>
            <div role="tabpanel" id="session-attendees-panel" aria-labelledby="session-attendees-tab" hidden={tab !== "attendees"} tabIndex={0}>
                <h3>Recorded attendees</h3>
                {session.attendees.length ? <ul className={styles.attendees}>{session.attendees.map((id, index) => <li key={`${id}-${index}`}>{getUserName(id)}</li>)}</ul>
                    : <p className={styles.empty}>No attendees recorded for this session.</p>}
            </div>
        </div>
        <footer className={styles.footer}>
            {!session.cancelled ? <button ref={cancelButtonRef} type="button" className={styles.dangerButton}
                disabled={busy || !onCancelSession} title={!onCancelSession ? "The session's mentorship record is unavailable." : undefined}
                aria-haspopup="dialog" aria-controls="session-cancel-confirmation" onClick={() => {
                    setError(undefined);
                    confirmationRef.current?.showModal();
                }}><Trash size={18}/>Cancel Session</button> : <span role="status" className={styles.empty}>{status}</span>}
            <button type="button" className={styles.closeButton} onClick={onClose} disabled={busy}>Close</button>
        </footer>
        <dialog ref={confirmationRef} id="session-cancel-confirmation" className={styles.confirmation}
            aria-labelledby="session-cancel-title" aria-describedby="session-cancel-description"
            onCancel={event => {event.preventDefault(); event.stopPropagation(); dismissConfirmation();}}>
            <h3 id="session-cancel-title">Cancel this session?</h3>
            <p id="session-cancel-description">The session will be marked as cancelled.</p>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.confirmationActions}>
                <button type="button" autoFocus onClick={dismissConfirmation} disabled={busy}>Keep Session</button>
                <button type="button" className={styles.dangerButton} onClick={() => void cancelSession()} disabled={busy}>{busy ? "Cancelling..." : "Confirm Cancellation"}</button>
            </div>
        </dialog>
    </dialog>;
}
