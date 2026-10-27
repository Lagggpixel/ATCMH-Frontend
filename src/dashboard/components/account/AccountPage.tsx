import {useEffect, useState} from "react";
import {Link, useSearchParams} from "@/src/dashboard/next-navigation";
import type {DashboardAuthSession} from "../../types/Account.ts";
import styles from "./AccountPage.module.css";
import {accountPageState, accountStatusLabel} from "./AccountPageState.ts";
import {homeLoginHref} from "@/src/platform/auth/login-routing";
import {availableUserName} from "@/src/lib/user-display-name";
import ProfileAvatar from "@/src/platform/auth/ProfileAvatar";
import {profileDisplayName} from "@/src/platform/auth/profile-avatar";

interface AccountPageProps {
    session: DashboardAuthSession | null;
    avatarUrl?: string | null;
    loading: boolean;
    error?: string | null;
    onLogout: (all?: boolean) => Promise<void>;
}

const identityName = (provider: string) => provider.toLowerCase() === "ifc" ? "Infinite Flight" : "Discord";

export default function AccountPage({session, avatarUrl, loading, error, onLogout}: AccountPageProps) {
    const [params] = useSearchParams();
    const [notifications, setNotifications] = useState<{feedback: boolean; assignment: boolean} | null>(null), [notificationError, setNotificationError] = useState(""), [saving, setSaving] = useState(false);
    const sessionAccountId = session?.accountId;
    useEffect(() => {if (!sessionAccountId) return; const controller = new AbortController(); fetch("/api/account/sweatbox-notifications", {cache: "no-store", signal: controller.signal}).then(async r => {if (!r.ok) throw new Error(); return r.json();}).then(setNotifications).catch(() => {if (!controller.signal.aborted) setNotificationError("Could not load notification settings.");}); return () => controller.abort();}, [sessionAccountId]);
    const changeNotifications = async (next: {feedback: boolean; assignment: boolean}) => {if (!session) return; setSaving(true); setNotificationError(""); try {const response = await fetch("/api/account/sweatbox-notifications", {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": session.csrfToken}, body: JSON.stringify(next)}); if (!response.ok) throw new Error(); setNotifications(next);} catch {setNotificationError("Could not save notification settings. Try again.");} finally {setSaving(false);}};
    const state = accountPageState(session, loading, error, params.get("authError"));
    if (state.kind === "loading") return <main className={styles.accountPage}><p>Restoring your account…</p></main>;
    if (state.kind === "signed-out") return <main className={styles.accountPage}><section className={styles.card}><h1>Your ATCMH account</h1>{state.authMessage ? <p role="alert" className={styles.error}>{state.authMessage}</p> : null}{state.error ? <p role="alert" className={styles.error}>We could not restore your session: {state.error}</p> : null}<p>Return home to sign in and view your linked identities and sessions.</p><Link className={styles.primary} to={homeLoginHref("dashboard", "/account")}>Return home</Link></section></main>;
    const activeSession = session!;

    const byProvider = new Map(activeSession.identities.map(identity => [identity.provider.toLowerCase(), identity]));
    return <main className={styles.accountPage}>
        <section className={styles.card}>
            <div className={styles.profileHeading}>
                <ProfileAvatar avatarUrl={avatarUrl} displayName={profileDisplayName(activeSession)} size={72}/>
                <div><p className={styles.eyebrow}>Account {activeSession.accountId}</p><h1>Your ATCMH account</h1></div>
            </div>
            <dl className={styles.summary}>
                <div><dt>Status</dt><dd>{accountStatusLabel(activeSession.status)}</dd></div>
                <div><dt>Session</dt><dd>ATCMH web</dd></div>
                <div><dt>Session expires</dt><dd>{new Date(activeSession.expiresAt).toLocaleString()}</dd></div>
            </dl>
            <h2>Linked identities</h2>
            <div className={styles.identityGrid}>{["discord", "ifc"].map(provider => {
                const identity = byProvider.get(provider);
                return <article className={styles.identity} key={provider}><span>{identityName(provider)}</span>{identity ? <><strong>{availableUserName(identity.displayName) ?? identity.subject}</strong><small>{identity.subject}</small></> : <strong>Not linked</strong>}</article>;
            })}</div>
            <h2>Sweatbox Discord notifications</h2><p>Choose which Sweatbox direct messages you receive.</p>
            {notificationError ? <p role="alert">{notificationError}</p> : null}
            {notifications ? <div><label><input type="checkbox" checked={notifications.feedback} disabled={saving} onChange={e => void changeNotifications({...notifications, feedback: e.target.checked})}/> Feedback given or updated</label><br/><label><input type="checkbox" checked={notifications.assignment} disabled={saving} onChange={e => void changeNotifications({...notifications, assignment: e.target.checked})}/> Session assignments</label></div> : <p>Loading notification settings…</p>}
            <div className={styles.actions}><button type="button" onClick={() => void onLogout(false)}>Log out here</button><button type="button" className={styles.danger} onClick={() => void onLogout(true)}>Log out everywhere</button></div>
        </section>
    </main>;
}
