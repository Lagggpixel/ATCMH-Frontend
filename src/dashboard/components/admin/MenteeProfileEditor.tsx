import {useEffect, useRef, useState, type ReactNode} from "react";
import {XIcon as X} from "@phosphor-icons/react/X";
import type {AdminMentee} from "../../types/AdminMentee.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import WeeklyAvailabilityEditor from "../../../apply/WeeklyAvailabilityEditor.tsx";
import {defaultWeeklyAvailabilityAnswer} from "../../../apply/weekly-availability.ts";
import {applicationRegions, commonTimezoneOffsets} from "../../../apply/location-input.ts";
import styles from "./MenteeProfileEditor.module.css";

export default function MenteeProfileEditor({mentee, menteeName, token, onSaved, children, triggerClassName, triggerContent = "Edit profile"}: {
    mentee: AdminMentee; menteeName?: string; token: string | null; onSaved: (mentee: AdminMentee) => void;
    children: (trigger: ReactNode) => ReactNode; triggerClassName: string; triggerContent?: ReactNode;
}) {
    const [editing, setEditing] = useState(false);
    const [region, setRegion] = useState(mentee.region ?? "");
    const [timezone, setTimezone] = useState(mentee.timezone ?? "");
    const [availability, setAvailability] = useState(mentee.availability || defaultWeeklyAvailabilityAnswer);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const regionRef = useRef<HTMLSelectElement>(null);
    const editorId = `mentee-profile-editor-${mentee.id}`;
    useEffect(() => {
        if (!editing) return;
        const dialog = dialogRef.current;
        const opener = triggerRef.current;
        const previousOverflow = document.body.style.overflow;
        dialog?.showModal();
        document.body.style.overflow = "hidden";
        regionRef.current?.focus();
        return () => {
            dialog?.close();
            document.body.style.overflow = previousOverflow;
            if (opener?.isConnected) opener.focus();
        };
    }, [editing]);
    const close = () => {
        dialogRef.current?.close();
        setEditing(false);
    };
    const begin = () => {
        if (editing) { regionRef.current?.focus(); return; }
        setRegion(mentee.region ?? ""); setTimezone(mentee.timezone ?? "");
        setAvailability(mentee.availability || defaultWeeklyAvailabilityAnswer);
        setError(undefined); setSaved(false); setEditing(true);
    };
    return <>
        {children(<button ref={triggerRef} className={triggerClassName} type="button" onClick={begin} aria-haspopup="dialog" aria-controls={editing ? editorId : undefined}>{triggerContent}</button>)}
        {saved ? <p role="status" className={styles.savedStatus}>Profile saved.</p> : null}
        {editing ? <dialog ref={dialogRef} id={editorId} className={styles.editor} aria-labelledby={`${editorId}-title`}
            onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
            <form className={styles.form} aria-busy={busy} onSubmit={async event => {
                event.preventDefault();
                if (busy) return;
                setBusy(true); setError(undefined);
                try {
                    const updated = await ApiUtils.updateMenteeProfile(token, mentee.id, {region, timezone, availability});
                    if (!updated) throw new Error("Your session expired. Sign in again to save.");
                    onSaved(updated); close(); setSaved(true);
                } catch (failure) { setError(failure instanceof Error ? failure.message : "Failed to save profile."); }
                finally { setBusy(false); }
            }}>
                <header className={styles.header}>
                    <div>
                        {menteeName ? <p className={styles.eyebrow}>{menteeName}</p> : null}
                        <h2 id={`${editorId}-title`}>Edit mentee profile</h2>
                    </div>
                    <button className={styles.closeButton} type="button" disabled={busy} onClick={close} aria-label="Close profile editor"><X size={20} aria-hidden="true"/></button>
                </header>
                <div className={styles.body}>
                <fieldset className={styles.fields} disabled={busy}>
                    <p className={styles.description}>Changes are recorded in audit logs and sent to mentee-logs.</p>
                    <div className={styles.locationFields}>
                        <div className={styles.field}>
                            <label htmlFor={`${editorId}-region`}>Region</label>
                            <select ref={regionRef} id={`${editorId}-region`} required value={region} onChange={event => setRegion(event.target.value)}>
                                <option value="" disabled>Choose a region</option>
                                {region && !applicationRegions.some(option => option === region) ? <option value={region}>Current value: {region}</option> : null}
                                {applicationRegions.map(option => <option key={option} value={option}>{option}</option>)}
                            </select>
                        </div>
                        <div className={styles.field}>
                            <label htmlFor={`${editorId}-timezone`}>Timezone</label>
                            <select id={`${editorId}-timezone`} required value={timezone} onChange={event => setTimezone(event.target.value)} aria-describedby={`${editorId}-timezone-help`}>
                                <option value="" disabled>Choose a UTC offset</option>
                                {timezone && !commonTimezoneOffsets.includes(timezone) ? <option value={timezone}>Current value: {timezone}</option> : null}
                                {commonTimezoneOffsets.map(option => <option key={option} value={option}>{option}</option>)}
                            </select>
                            <p id={`${editorId}-timezone-help`} className={styles.hint}>Current UTC offset, including daylight saving time.</p>
                        </div>
                    </div>
                    <fieldset className={styles.availability}>
                        <legend>Weekly availability (UTC)</legend>
                        <p className={styles.hint}>Add a second time on a day with a break, for example mornings and evenings.</p>
                        <WeeklyAvailabilityEditor id={`${editorId}-availability`} value={availability} onChange={setAvailability}/>
                    </fieldset>
                    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
                </fieldset>
                </div>
                <footer className={styles.actions}>
                    <button type="button" className={styles.cancelButton} disabled={busy} onClick={close}>Cancel</button>
                    <button className={styles.saveButton} type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
                </footer>
            </form></dialog> : null}
    </>;
}
