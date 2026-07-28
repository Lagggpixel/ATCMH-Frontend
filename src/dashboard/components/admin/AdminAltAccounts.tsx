import {type FormEvent, type Ref, useCallback, useEffect, useRef, useState} from "react";
import {Link} from "@/src/dashboard/next-navigation";
import type {AltAccountCandidate, AltEvidenceScan, AltSuppression} from "../../types/Account.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import {dialogKeyResult} from "../../utils/DialogKeyboard.ts";
import styles from "./AdminAltAccounts.module.css";

type PendingAction = {kind: "detach" | "vpn"; ip: string; accountId?: string} | {kind: "reverse"; suppression: AltSuppression};
type EvidenceType = AltAccountCandidate["evidenceType"];

const evidenceOrder: EvidenceType[] = ["SAME_IP", "VPN_INDICATOR", "NETWORK_SIMILARITY", "OWNERSHIP_CONFLICT"];

export function groupAltEvidence(candidates: AltAccountCandidate[]): Map<EvidenceType, AltAccountCandidate[]> {
    const groups = new Map<EvidenceType, AltAccountCandidate[]>(evidenceOrder.map(type => [type, []]));
    candidates.forEach(candidate => groups.get(candidate.evidenceType)?.push(candidate));
    return groups;
}

export function ReviewSignalNotice() {
    return <aside className={styles.notice}><strong>Review signals, not determinations</strong><p>An exact address, a nearby network prefix, or a VPN indicator does not prove dynamic allocation, VPN use, shared ownership, or the same person. Confirm context before taking account action.</p></aside>;
}

export function RescanStatus({scan}: {scan: AltEvidenceScan | null}) {
    if (!scan) return null;
    if (scan.state === "RUNNING") return <p className={styles.scanStatus} role="status">Rescanning account {scan.accountId}: {scan.completed} of {scan.total} addresses checked{scan.failed ? ` · ${scan.failed} unavailable` : ""}.</p>;
    if (scan.state === "FAILED") return <p className={styles.error} role="alert">Rescan failed ({scan.failureCode ?? "RESCAN_FAILED"}). Existing evidence is unchanged.</p>;
    return <p className={styles.scanStatus} role="status">Rescan complete: {scan.completed} checked, {scan.failed} unavailable.{scan.truncated ? " The 100 most recent addresses were refreshed; older stored evidence remains visible." : ""}</p>;
}

export function AltActionDialog({pending, reason, dialogRef, onReason, onSubmit, onCancel}: {pending: PendingAction | null; reason: string; dialogRef?: Ref<HTMLFormElement>; onReason: (value: string) => void; onSubmit: (event: FormEvent) => void; onCancel: () => void}) {
    return pending ? <div className={styles.modalBackdrop} role="presentation"><form ref={dialogRef} className={styles.modal} onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="suppression-title"><p className={styles.eyebrow}>Evidence suppression</p><h2 id="suppression-title">{pending.kind === "reverse" ? "Reverse suppression" : pending.kind === "vpn" ? "Classify as VPN" : `Detach account ${pending.accountId}`}</h2><p>This changes candidate matching only. It does not delete security events or make an account decision.</p><label>Required reason<textarea autoFocus required maxLength={512} value={reason} onChange={event => onReason(event.target.value)}/></label><div><button type="submit" disabled={!reason.trim()}>Confirm</button><button type="button" onClick={onCancel}>Cancel</button></div></form></div> : null;
}

export function AltEvidenceActions({candidate, onAction}: {candidate: AltAccountCandidate; onAction: (action: PendingAction, trigger: HTMLButtonElement) => void}) {
    return candidate.ip ? <div className={styles.actions}>{candidate.accounts.map(accountId => <button type="button" key={accountId} onClick={event => onAction({kind: "detach", ip: candidate.ip!, accountId}, event.currentTarget)}>Detach account {accountId}</button>)}<button type="button" onClick={event => onAction({kind: "vpn", ip: candidate.ip!}, event.currentTarget)}>Mark IP as VPN</button></div> : <p className={styles.reviewLink}>Resolve ownership through the normal account preview workflow.</p>;
}

function AccountLinks({accounts, onSelect}: {accounts: string[]; onSelect: (accountId: string) => void}) {
    return <div className={styles.accounts}>{accounts.map(account => <span key={account}><Link to={`/dashboard/accounts?accountId=${encodeURIComponent(account)}`}>Account {account}</Link><button type="button" onClick={() => onSelect(account)}>Use as subject</button></span>)}</div>;
}

function CandidateCard({candidate, onSelect, onAction}: {candidate: AltAccountCandidate; onSelect: (accountId: string) => void; onAction: (action: PendingAction, trigger: HTMLButtonElement) => void}) {
    const indicator = candidate.signals?.join(" · ");
    return <article>
        <div className={styles.candidateHeader}><span>{candidate.evidenceType === "SAME_IP" ? "Same IP" : candidate.evidenceType === "VPN_INDICATOR" ? "VPN indicator" : candidate.evidenceType === "NETWORK_SIMILARITY" ? "Network similarity" : "Historical identity conflict"}</span><strong>{candidate.count} event{candidate.count === 1 ? "" : "s"}</strong></div>
        {candidate.ip ? <code>{candidate.ip}</code> : candidate.network ? <code>{candidate.network}</code> : <p><strong>{candidate.provider}</strong> identity {candidate.subject}</p>}
        {candidate.evidenceType === "VPN_INDICATOR" ? <p className={styles.metadata}>{candidate.indicatorSource === "MANUAL" ? "Manual staff indicator" : "Existing provider indicator"}{indicator ? ` · ${indicator}` : ""}{candidate.networkProvider ? ` · ${candidate.networkProvider}` : ""}</p> : null}
        <p className={styles.rationale}>{candidate.rationale}</p>
        <p className={styles.dates}>First {new Date(candidate.firstSeen).toLocaleString()} · Last {new Date(candidate.lastSeen).toLocaleString()}</p>
        {candidate.addresses?.length ? <div className={styles.addresses}>{candidate.addresses.map(address => <div key={address.ip}><code>{address.ip}</code><AccountLinks accounts={address.accounts} onSelect={onSelect}/></div>)}</div> : null}
        <AccountLinks accounts={candidate.accounts} onSelect={onSelect}/>
        <AltEvidenceActions candidate={candidate} onAction={onAction}/>
    </article>;
}

const sectionCopy: Record<EvidenceType, {title: string; description: string}> = {
    SAME_IP: {title: "Exact same-IP groups", description: "Accounts grouped only when their canonical recorded address is exactly equal."},
    VPN_INDICATOR: {title: "VPN-related indicators", description: "Manual classifications and normalized results from the provider already configured by ATCMH."},
    NETWORK_SIMILARITY: {title: "Similar network candidates", description: "Distinct addresses grouped by IPv4 /24 or IPv6 /64 prefix so nearby candidates stay together."},
    OWNERSHIP_CONFLICT: {title: "Identity conflicts", description: "Historical conflicts from canonical account-link records."},
};

export function EvidenceSections({candidates, onSelect, onAction}: {candidates: AltAccountCandidate[]; onSelect: (accountId: string) => void; onAction: (action: PendingAction, trigger: HTMLButtonElement) => void}) {
    const grouped = groupAltEvidence(candidates);
    return <div className={styles.sections}>{evidenceOrder.map(type => {
        const items = grouped.get(type) ?? [];
        if (!items.length) return null;
        return <section key={type} className={styles.group}><header><h2>{sectionCopy[type].title}</h2><p>{sectionCopy[type].description}</p></header><div className={styles.candidates}>{items.map((candidate, index) => <CandidateCard key={`${candidate.evidenceType}-${candidate.ip ?? candidate.network ?? candidate.subject}-${index}`} candidate={candidate} onSelect={onSelect} onAction={onAction}/>)}</div></section>;
    })}</div>;
}

export default function AdminAltAccounts({csrfToken, adminUser, loaded}: {csrfToken: string | null; adminUser?: AdminUser; loaded: boolean}) {
    const [candidates, setCandidates] = useState<AltAccountCandidate[]>([]);
    const [suppressions, setSuppressions] = useState<AltSuppression[]>([]);
    const [subjectInput, setSubjectInput] = useState("");
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [scan, setScan] = useState<AltEvidenceScan | null>(null);
    const [startingScan, setStartingScan] = useState(false);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const dialogRef = useRef<HTMLFormElement>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const mounted = useRef(true);

    const load = useCallback(async (accountId?: string) => {
        if (!csrfToken) return;
        setLoading(true); setError(null);
        try { const result = await ApiUtils.getAltAccounts(csrfToken, accountId); if (mounted.current) { setCandidates(result.candidates); setSuppressions(result.suppressions); } }
        catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { if (mounted.current) setLoading(false); }
    }, [csrfToken]);

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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

    const selectSubject = (accountId: string) => { setSubjectInput(accountId); setSelectedAccountId(accountId); setScan(null); void load(accountId); };
    const reviewSubject = (event: FormEvent) => { event.preventDefault(); const value = subjectInput.trim(); if (!/^\d+$/.test(value)) { setError("Enter a canonical numeric account ID."); return; } selectSubject(value); };
    const showAll = () => { setSubjectInput(""); setSelectedAccountId(null); setScan(null); void load(); };
    const beginRescan = async () => {
        if (!csrfToken || !selectedAccountId || startingScan || scan?.state === "RUNNING") return;
        setStartingScan(true); setError(null);
        try {
            let current = await ApiUtils.startAltEvidenceRescan(csrfToken, selectedAccountId);
            if (!mounted.current) return;
            setScan(current);
            while (current.state === "RUNNING" && mounted.current) {
                await new Promise(resolve => window.setTimeout(resolve, 750));
                current = await ApiUtils.getAltEvidenceRescan(csrfToken, current.id);
                if (mounted.current) setScan(current);
            }
            if (mounted.current && current.state === "COMPLETED") await load(selectedAccountId);
        } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { if (mounted.current) setStartingScan(false); }
    };
    const openPending = (action: PendingAction, trigger: HTMLButtonElement) => { triggerRef.current = trigger; setReason(""); setPending(action); };
    const submit = async (event: FormEvent) => {
        event.preventDefault(); if (!pending || !csrfToken || !reason.trim()) return;
        try {
            if (pending.kind === "reverse") await ApiUtils.reverseAltSuppression(csrfToken, pending.suppression.id, reason.trim());
            else await ApiUtils.suppressAltSignal(csrfToken, pending.kind, {accountId: pending.accountId, ip: pending.ip, reason: reason.trim()});
            setPending(null); setReason(""); await load(selectedAccountId ?? undefined);
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };

    if (!loaded) return <AdminLoadingScreen/>;
    if (!adminUser?.canReviewAltAccounts) return <AdminUnauthorizedScreen/>;
    return <main className={styles.page}>
        <ReviewSignalNotice/>
        <section className={styles.subjectPanel}><form onSubmit={reviewSubject}><label>Subject account ID<input inputMode="numeric" pattern="[0-9]+" value={subjectInput} onChange={event => setSubjectInput(event.target.value)} placeholder="Canonical account ID"/></label><button type="submit">Review subject</button><button type="button" onClick={showAll}>Show all</button></form><div><strong>{selectedAccountId ? `Reviewing account ${selectedAccountId}` : "All current evidence groups"}</strong><button type="button" onClick={() => void beginRescan()} disabled={!selectedAccountId || startingScan || scan?.state === "RUNNING"}>{startingScan || scan?.state === "RUNNING" ? "Rescanning…" : "Rescan selected subject"}</button></div><RescanStatus scan={scan}/></section>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {loading ? <p>Loading evidence…</p> : candidates.length ? <EvidenceSections candidates={candidates} onSelect={selectSubject} onAction={openPending}/> : <p className={styles.empty}>No unsuppressed evidence candidates for this view.</p>}
        <section className={styles.suppressions}><h2>Suppression history</h2><p>Original audit and login evidence remains intact. Active suppressions can be reversed.</p>{suppressions.map(item => <article key={item.id}><span><strong>{item.type === "GLOBAL_VPN" ? "VPN classification" : `Detached account ${item.accountId}`}</strong><code>{item.signal}</code><small>{item.reason}</small></span>{item.reversedAt ? <em>Reversed</em> : <button type="button" onClick={event => openPending({kind: "reverse", suppression: item}, event.currentTarget)}>Reverse</button>}</article>)}</section>
        <AltActionDialog pending={pending} reason={reason} dialogRef={dialogRef} onReason={setReason} onSubmit={submit} onCancel={() => setPending(null)}/>
    </main>;
}
