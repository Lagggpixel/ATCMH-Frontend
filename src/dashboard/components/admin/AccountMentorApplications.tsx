"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import type {MentorAccountSettings} from "../../types/MentorApplication";
import {ApiUtils} from "../../utils/ApiUtils";
import {ApplicationStatus, ReapplicationSettings, applicationDate} from "./MentorApplicationReview";
import styles from "./AdminMentorApplications.module.css";

export default function AccountMentorApplications({accountId, name, token}: {accountId: string; name: string; token: string}) {
    const [settings, setSettings] = useState<MentorAccountSettings>();
    const [error, setError] = useState<string>();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    useEffect(() => {
        let current = true;
        void ApiUtils.getMentorAccountSettings(token, accountId).then(value => {
            if (current) {setSettings(value); setError(undefined);}
        }).catch(cause => {if (current) setError(cause instanceof Error ? cause.message : String(cause));});
        return () => {current = false;};
    }, [accountId, token, reload]);
    const save = async (months: number | null, date: string | null) => {
        if (!settings) return;
        setBusy(true);
        try {setSettings(await ApiUtils.updateMentorAccountSettings(token, accountId, settings, months, date));}
        catch (cause) {
            // Refresh revision guards after a conflict before allowing another attempt.
            try {setSettings(await ApiUtils.getMentorAccountSettings(token, accountId));} catch {setError("Reload the applicant settings before trying again.");}
            throw cause;
        } finally {setBusy(false);}
    };
    const latest = settings?.latestApplication;
    return <section className={styles.accountSettings} aria-label="Mentor application cooldown">
        <h3>Mentor applications</h3>
        {error ? <><p role="alert">{error}</p><button type="button" className={styles.secondary} onClick={() => setReload(value => value + 1)}>Reload settings</button></> : !settings ? <p role="status">Loading application settings…</p> : <>
            {latest ? <ApplicationStatus status={latest.status}/> : <p className={styles.muted}>No applications yet.</p>}
            <dl><div><dt>Reapplication cooldown</dt><dd>{settings.waitMonths ?? settings.policy.waitMonths} calendar months{settings.waitMonths == null ? " · default" : " · individual override"}</dd></div>
                {latest?.status === "DENIED" ? <div><dt>Can reapply from</dt><dd>{applicationDate(latest.reapplyAt, true)}</dd></div> : <div><dt>Current cooldown</dt><dd>No active denial waiting period.</dd></div>}
            </dl>
            <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>Edit cooldown</button>
            {latest && <p><Link href={`/dashboard/mentor-applications?applicationId=${latest.id}`}>View application #{latest.id}</Link></p>}
            {open && <ReapplicationSettings policy={settings.policy} account={{name, waitMonths:settings.waitMonths, latestApplication:latest ?? null}} busy={busy} onClose={() => setOpen(false)} onSave={save}/>}
        </>}
    </section>;
}
