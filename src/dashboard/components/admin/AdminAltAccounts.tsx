import {type FormEvent, type Ref, useCallback, useEffect, useRef, useState} from "react";
import {Link} from "@/src/dashboard/next-navigation";
import type {AltAccountCandidate, AltSuppression} from "../../types/Account.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import AdminNav from "./AdminNav.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import {dialogKeyResult} from "../../utils/DialogKeyboard.ts";
import styles from "./AdminAltAccounts.module.css";

type PendingAction = {kind: "detach" | "vpn"; ip: string; accountId?: string} | {kind: "reverse"; suppression: AltSuppression};

export function AltActionDialog({pending, reason, dialogRef, onReason, onSubmit, onCancel}: {pending: PendingAction | null; reason: string; dialogRef?: Ref<HTMLFormElement>; onReason: (value: string) => void; onSubmit: (event: FormEvent) => void; onCancel: () => void}) {
    return pending ? <div className={styles.modalBackdrop} role="presentation"><form ref={dialogRef} className={styles.modal} onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="suppression-title"><p className={styles.eyebrow}>Evidence suppression</p><h2 id="suppression-title">{pending.kind === "reverse" ? "Reverse suppression" : pending.kind === "vpn" ? "Classify as VPN" : `Detach account ${pending.accountId}`}</h2><p>This changes candidate matching only. It does not delete security events or make an account decision.</p><label>Required reason<textarea autoFocus required maxLength={512} value={reason} onChange={event => onReason(event.target.value)}/></label><div><button type="submit" disabled={!reason.trim()}>Confirm</button><button type="button" onClick={onCancel}>Cancel</button></div></form></div> : null;
}
export function AltEvidenceActions({candidate, onAction}: {candidate: AltAccountCandidate; onAction: (action: PendingAction, trigger: HTMLButtonElement) => void}) {
    return candidate.ip ? <div className={styles.actions}>{candidate.accounts.map(accountId => <button type="button" key={accountId} onClick={event => onAction({kind: "detach", ip: candidate.ip!, accountId}, event.currentTarget)}>Detach account {accountId}</button>)}<button type="button" onClick={event => onAction({kind: "vpn", ip: candidate.ip!}, event.currentTarget)}>Mark IP as VPN</button></div> : <p className={styles.reviewLink}>Resolve ownership through the normal account preview workflow.</p>;
}

export default function AdminAltAccounts({csrfToken, adminUser, loaded}: {csrfToken: string | null; adminUser?: AdminUser; loaded: boolean}) {
    const [candidates, setCandidates] = useState<AltAccountCandidate[]>([]);
    const [suppressions, setSuppressions] = useState<AltSuppression[]>([]);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const dialogRef = useRef<HTMLFormElement>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const load = useCallback(async () => {
        if (!csrfToken) return;
        setLoading(true); setError(null);
        try { const result = await ApiUtils.getAltAccounts(csrfToken); setCandidates(result.candidates); setSuppressions(result.suppressions); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setLoading(false); }
    }, [csrfToken]);
    useEffect(() => { if (adminUser?.canReviewAltAccounts) void load(); }, [adminUser?.canReviewAltAccounts, load]);
    useEffect(() => {
        if (!pending) return;
        const trigger = triggerRef.current;
        const handleKeyDown = (event: KeyboardEvent) => {
            const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]") ?? []);
            const result = dialogKeyResult(event.key, event.shiftKey, controls.indexOf(document.activeElement as HTMLElement), controls.length);
            if (result.close) { event.preventDefault(); setPending(null); return; }
            if (result.focusIndex != null) { event.preventDefault(); controls[result.focusIndex]?.focus(); }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => { document.removeEventListener("keydown", handleKeyDown); window.setTimeout(() => trigger?.focus(), 0); };
    }, [pending]);
    const openPending = (action: PendingAction, trigger: HTMLButtonElement) => { triggerRef.current = trigger; setReason(""); setPending(action); };
    const submit = async (event: FormEvent) => {
        event.preventDefault(); if (!pending || !csrfToken || !reason.trim()) return;
        try {
            if (pending.kind === "reverse") await ApiUtils.reverseAltSuppression(csrfToken, pending.suppression.id, reason.trim());
            else await ApiUtils.suppressAltSignal(csrfToken, pending.kind, {accountId: pending.accountId, ip: pending.ip, reason: reason.trim()});
            setPending(null); setReason(""); await load();
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    if (!loaded) return <AdminLoadingScreen/>;
    if (!adminUser?.canReviewAltAccounts) return <AdminUnauthorizedScreen/>;
    return <main className={styles.page}><AdminNav adminUser={adminUser}/>
        <header><p className={styles.eyebrow}>Super administrator</p><h1>Alt-account evidence</h1><p>Shared network and historical ownership signals are review leads only. They do not establish intent or trigger enforcement.</p></header>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {loading ? <p>Loading evidence…</p> : <section className={styles.candidates}>{candidates.length ? candidates.map((candidate, index) => <article key={`${candidate.evidenceType}-${candidate.ip ?? candidate.subject}-${index}`}>
            <div className={styles.candidateHeader}><span>{candidate.evidenceType === "SHARED_IP" ? "Exact shared login IP" : "Historical identity conflict"}</span><strong>{candidate.count} event{candidate.count === 1 ? "" : "s"}</strong></div>
            {candidate.ip ? <code>{candidate.ip}</code> : <p><strong>{candidate.provider}</strong> identity {candidate.subject}</p>}
            <p className={styles.dates}>First {new Date(candidate.firstSeen).toLocaleString()} · Last {new Date(candidate.lastSeen).toLocaleString()}</p>
            <div className={styles.accounts}>{candidate.accounts.map(account => <Link key={account} to={`/dashboard/accounts?accountId=${encodeURIComponent(account)}`}>Account {account}</Link>)}</div>
            <AltEvidenceActions candidate={candidate} onAction={openPending}/>
        </article>) : <p className={styles.empty}>No unsuppressed evidence candidates.</p>}</section>}
        <section className={styles.suppressions}><h2>Suppression history</h2><p>Original audit and login evidence remains intact. Active suppressions can be reversed.</p>{suppressions.map(item => <article key={item.id}><span><strong>{item.type === "GLOBAL_VPN" ? "VPN classification" : `Detached account ${item.accountId}`}</strong><code>{item.signal}</code><small>{item.reason}</small></span>{item.reversedAt ? <em>Reversed</em> : <button type="button" onClick={event => openPending({kind: "reverse", suppression: item}, event.currentTarget)}>Reverse</button>}</article>)}</section>
        <AltActionDialog pending={pending} reason={reason} dialogRef={dialogRef} onReason={setReason} onSubmit={submit} onCancel={() => setPending(null)}/>
    </main>;
}
