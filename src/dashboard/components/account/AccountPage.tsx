import {Link, useSearchParams} from "@/src/dashboard/next-navigation";
import type {DashboardAuthSession} from "../../types/Account.ts";
import styles from "./AccountPage.module.css";
import {accountPageState, accountStatusLabel} from "./AccountPageState.ts";

interface AccountPageProps {
    session: DashboardAuthSession | null;
    loading: boolean;
    error?: string | null;
    canAccessAdmin?: boolean;
    onLogout: (all?: boolean) => Promise<void>;
}

const identityName = (provider: string) => provider.toLowerCase() === "ifc" ? "Infinite Flight" : "Discord";

export default function AccountPage({session, loading, error, canAccessAdmin = false, onLogout}: AccountPageProps) {
    const [params] = useSearchParams();
    const state = accountPageState(session, loading, error, params.get("authError"));
    if (state.kind === "loading") return <main className={styles.accountPage}><p>Restoring your account…</p></main>;
    if (state.kind === "signed-out") return <main className={styles.accountPage}><section className={styles.card}><h1>Your ATCMH account</h1>{state.authMessage ? <p role="alert" className={styles.error}>{state.authMessage}</p> : null}{state.error ? <p role="alert" className={styles.error}>We could not restore your session: {state.error}</p> : null}<p>Sign in to view your linked identities and sessions.</p><Link className={styles.primary} to="/auth?returnTo=/account">Sign in</Link></section></main>;
    const activeSession = session!;

    const byProvider = new Map(activeSession.identities.map(identity => [identity.provider.toLowerCase(), identity]));
    return <main className={styles.accountPage}>
        <section className={styles.card}>
            <p className={styles.eyebrow}>Account {activeSession.accountId}</p>
            <h1>Your ATCMH account</h1>
            <dl className={styles.summary}>
                <div><dt>Status</dt><dd>{accountStatusLabel(activeSession.status)}</dd></div>
                <div><dt>Application</dt><dd>Dashboard</dd></div>
                <div><dt>Session expires</dt><dd>{new Date(activeSession.expiresAt).toLocaleString()}</dd></div>
            </dl>
            <h2>Linked identities</h2>
            <div className={styles.identityGrid}>{["discord", "ifc"].map(provider => {
                const identity = byProvider.get(provider);
                return <article className={styles.identity} key={provider}><span>{identityName(provider)}</span>{identity ? <><strong>{identity.displayName || identity.subject}</strong><small>{identity.subject}</small></> : <strong>Not linked</strong>}</article>;
            })}</div>
            <div className={styles.actions}><button type="button" onClick={() => void onLogout(false)}>Log out here</button><button type="button" className={styles.danger} onClick={() => void onLogout(true)}>Log out everywhere</button></div>
            {canAccessAdmin ? <Link className={styles.subtleLink} to="/dashboard">Open staff dashboard</Link> : null}
        </section>
    </main>;
}
