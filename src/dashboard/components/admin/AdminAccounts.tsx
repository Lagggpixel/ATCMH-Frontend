import {type FormEvent, useEffect, useMemo, useState} from "react";
import {useSearchParams} from "@/src/dashboard/next-navigation";
import type {AccountDetail, AccountIdentity, AccountSummary, AdminMutationPreview, AdminOperation} from "../../types/Account.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import {buildMutationRequest, createMutationUiState, mergeIdentityOptions, mutationUiReducer, type MutationDraft} from "../../utils/AccountMutationUtils.ts";
import AdminNav from "./AdminNav.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import styles from "./AdminAccounts.module.css";
import {examsImpersonationHandoffUrl} from "../../utils/AuthSessionUtils.ts";

const operations: Array<{value: AdminOperation; label: string}> = [
    {value: "LINK", label: "Link identity"}, {value: "REASSIGN", label: "Reassign identity"},
    {value: "UNLINK", label: "Unlink identity"}, {value: "MERGE", label: "Merge into another account"},
    {value: "SUSPEND", label: "Suspend"}, {value: "RESTORE", label: "Restore"},
    {value: "DELETE", label: "Soft delete"}, {value: "LOGOUT_ALL", label: "Log out all sessions"},
    {value: "IMPERSONATE_DASHBOARD", label: "Impersonate in Dashboard"}, {value: "IMPERSONATE_EXAMS", label: "Impersonate in Exams"},
];

const subject = (identity: AccountIdentity) => identity.providerSubject ?? identity.subject;
const formatCell = (value: unknown) => value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

function RecordList({title, rows}: {title: string; rows: Record<string, unknown>[]}) {
    return <section className={styles.recordSection}><h3>{title} <span>{rows.length}</span></h3>{rows.length ? <div className={styles.recordList}>{rows.map((row, index) => <details key={`${title}-${index}`}><summary>{formatCell(row.action ?? row.operation ?? row.outcome ?? row.application ?? row.id)}</summary><dl>{Object.entries(row).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{formatCell(value)}</dd></div>)}</dl></details>)}</div> : <p className={styles.muted}>No records.</p>}</section>;
}

export function AccountRequestError({error}: {error: string | null}) {
    return error ? <div className={styles.error} role="alert"><strong>Request not completed</strong><span>{error}</span><small>A conflict or stale preview never changes account ownership. Reload the account before trying again.</small></div> : null;
}

export function AccountMutationConfirmation({preview, reason, onReason, onCommit, onCancel}: {preview: AdminMutationPreview | null; reason: string; onReason: (value: string) => void; onCommit: () => void; onCancel: () => void}) {
    return preview ? <section className={styles.preview}><p className={styles.eyebrow}>Confirmation preview</p><h3>{preview.operation.replace(/_/g, " ")}</h3><p>Account {preview.sourceAccountId}{preview.targetAccountId ? ` → account ${preview.targetAccountId}` : ""}</p><p>Version {preview.sourceVersion}{preview.targetVersion != null ? ` / ${preview.targetVersion}` : ""}; expires {new Date(preview.expiresAt).toLocaleTimeString()}</p><pre>{JSON.stringify(preview.parameters, null, 2)}</pre><label>Required reason<textarea required maxLength={512} value={reason} onChange={event => onReason(event.target.value)}/></label><div><button type="button" className={styles.dangerButton} disabled={!reason.trim()} onClick={onCommit}>Confirm action</button><button type="button" onClick={onCancel}>Cancel</button></div></section> : null;
}

export default function AdminAccounts({csrfToken, adminUser, loaded, onSessionChanged}: {csrfToken: string | null; adminUser?: AdminUser; loaded: boolean; onSessionChanged: () => Promise<void>}) {
    const [searchParams] = useSearchParams();
    const linkedAccountId = searchParams.get("accountId") ?? "";
    const [filters, setFilters] = useState({accountId: linkedAccountId, discord: "", ifc: "", status: "", identityActive: ""});
    const [accounts, setAccounts] = useState<AccountSummary[]>([]);
    const [selected, setSelected] = useState<AccountDetail | null>(null);
    const [mutation, setMutation] = useState(() => createMutationUiState());
    const {draft, preview, reason} = mutation;
    const editDraft = (patch: Partial<MutationDraft>) => setMutation(current => mutationUiReducer(current, {type: "EDIT_DRAFT", patch}));
    const [mergeTarget, setMergeTarget] = useState<AccountDetail | null>(null);
    const [mergeTargetError, setMergeTargetError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const search = async () => {
        if (!csrfToken) return;
        setLoading(true); setError(null);
        try { setAccounts(await ApiUtils.searchAccounts(csrfToken, filters)); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setLoading(false); }
    };
    useEffect(() => { if (adminUser?.canManageAccounts) void search(); }, [adminUser?.canManageAccounts, csrfToken]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!adminUser?.canManageAccounts || !csrfToken || !linkedAccountId) return;
        void ApiUtils.getAccount(csrfToken, linkedAccountId).then(detail => {setSelected(detail); setMutation(current => mutationUiReducer(current, {type: "SELECT_ACCOUNT", accountId: linkedAccountId}));}).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
    }, [adminUser?.canManageAccounts, csrfToken, linkedAccountId]);

    const open = async (id: string) => {
        if (!csrfToken) return;
        setError(null);
        try { const detail = await ApiUtils.getAccount(csrfToken, id); setSelected(detail); setMergeTarget(null); setMergeTargetError(null); setMutation(current => mutationUiReducer(current, {type: "SELECT_ACCOUNT", accountId: id})); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };

    const submitPreview = async (event: FormEvent) => {
        event.preventDefault(); if (!csrfToken) return;
        setError(null);
        try { const nextPreview = await ApiUtils.previewAccountMutation(csrfToken, buildMutationRequest(draft)); setMutation(current => mutationUiReducer(current, {type: "PREVIEW_RECEIVED", preview: nextPreview})); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    const commit = async () => {
        if (!csrfToken || !preview || !reason.trim()) return;
        setError(null);
        try {
            const result = await ApiUtils.commitAccountMutation(csrfToken, preview.token, reason.trim());
            if (result.operation === "IMPERSONATE_DASHBOARD") { await onSessionChanged(); window.location.assign("/account"); return; }
            if (result.operation === "IMPERSONATE_EXAMS" && result.handoffCode) {
                window.location.assign(examsImpersonationHandoffUrl(window.location.origin, result.handoffCode)); return;
            }
            setMutation(current => mutationUiReducer(current, {type: "CANCEL_PREVIEW"})); await search(); await open(draft.sourceAccountId);
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };

    useEffect(() => {
        setMergeTarget(null); setMergeTargetError(null);
        if (draft.operation !== "MERGE" || !csrfToken || !draft.targetAccountId || draft.targetAccountId === draft.sourceAccountId) return;
        let current = true;
        const timer = window.setTimeout(() => void ApiUtils.getAccount(csrfToken, draft.targetAccountId).then(detail => {if (current) setMergeTarget(detail);}).catch(cause => {if (current) setMergeTargetError(cause instanceof Error ? cause.message : String(cause));}), 250);
        return () => {current = false; window.clearTimeout(timer);};
    }, [csrfToken, draft.operation, draft.sourceAccountId, draft.targetAccountId]);
    const discordMergeOptions = useMemo(() => selected ? mergeIdentityOptions(selected, mergeTarget, "discord") : [], [mergeTarget, selected]);
    const ifcMergeOptions = useMemo(() => selected ? mergeIdentityOptions(selected, mergeTarget, "ifc") : [], [mergeTarget, selected]);
    const mergeReady = draft.operation !== "MERGE" || (mergeTarget != null && !mergeTargetError && Boolean(draft.discordSubject) && Boolean(draft.ifcSubject));
    if (!loaded) return <AdminLoadingScreen/>;
    if (!adminUser?.canManageAccounts) return <AdminUnauthorizedScreen/>;
    return <main className={styles.page}><AdminNav adminUser={adminUser}/>
        <header className={styles.heading}><div><p className={styles.eyebrow}>Super administrator</p><h1>Accounts</h1><p>Review canonical Discord and Infinite Flight ownership. Every change is previewed, version-checked and reasoned.</p></div></header>
        <AccountRequestError error={error}/>
        <form className={styles.filters} onSubmit={event => {event.preventDefault(); void search();}}>
            <label>Account ID<input value={filters.accountId} onChange={e => setFilters({...filters, accountId: e.target.value})}/></label>
            <label>Discord ID or name<input value={filters.discord} onChange={e => setFilters({...filters, discord: e.target.value})}/></label>
            <label>IFC ID or name<input value={filters.ifc} onChange={e => setFilters({...filters, ifc: e.target.value})}/></label>
            <label>Status<select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}><option value="">Any</option>{["ACTIVE", "SUSPENDED", "DELETED", "MERGED"].map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Identity<select value={filters.identityActive} onChange={e => setFilters({...filters, identityActive: e.target.value})}><option value="">Any</option><option value="true">Active</option><option value="false">Archived</option></select></label>
            <button type="submit">{loading ? "Searching…" : "Search"}</button>
        </form>
        <div className={styles.layout}>
            <section className={styles.results} aria-label="Account search results">{accounts.length ? accounts.map(account => <button key={account.id} type="button" className={selected?.id === account.id ? styles.selectedResult : undefined} onClick={() => void open(account.id)}><span><strong>Account {account.id}</strong><small>{account.status}</small></span><span>{account.identities.filter(i => i.active !== false).map(i => i.displayName || subject(i)).join(" · ") || "No active identities"}</span></button>) : <p className={styles.muted}>No matching accounts.</p>}</section>
            <section className={styles.detail}>{selected ? <>
                <header className={styles.detailHeader}><div><p className={styles.eyebrow}>Account {selected.id}</p><h2>{selected.status}</h2></div><span>Version {selected.version}</span></header>
                {selected.suspensionReason ? <p className={styles.warning}>Suspended: {selected.suspensionReason}{selected.suspendedUntil ? ` until ${new Date(selected.suspendedUntil).toLocaleString()}` : ""}</p> : null}
                <div className={styles.identities}>{selected.identities.map(identity => <article key={`${identity.provider}-${subject(identity)}-${identity.id ?? ""}`}><span>{String(identity.provider)}</span><strong>{identity.displayName || subject(identity)}</strong><small>{subject(identity)}</small><em>{identity.active === false ? "Archived" : "Active"}</em></article>)}</div>
                <form className={styles.mutation} onSubmit={submitPreview}><h3>Management action</h3>
                    <label>Action<select value={draft.operation} onChange={e => editDraft({operation: e.target.value as AdminOperation})}>{operations.filter(operation => !operation.value.startsWith("IMPERSONATE") || adminUser.canImpersonate).map(operation => <option value={operation.value} key={operation.value}>{operation.label}</option>)}</select></label>
                    {["LINK", "REASSIGN", "UNLINK"].includes(draft.operation) ? <div className={styles.formRow}><label>Provider<select value={draft.provider} onChange={e => editDraft({provider: e.target.value as "DISCORD" | "IFC"})}><option>DISCORD</option><option>IFC</option></select></label><label>Provider subject<input required value={draft.subject} onChange={e => editDraft({subject: e.target.value})}/></label><label>Display name<input value={draft.displayName} onChange={e => editDraft({displayName: e.target.value})}/></label></div> : null}
                    {["MERGE", "REASSIGN"].includes(draft.operation) ? <label>{draft.operation === "MERGE" ? "Retained target account ID" : "Current owner account ID"}<input required value={draft.targetAccountId} onChange={e => editDraft({targetAccountId: e.target.value})}/></label> : null}
                    {draft.operation === "MERGE" ? <div className={styles.mergeChoices}>{mergeTargetError ? <p role="alert" className={styles.warning}>{mergeTargetError}</p> : draft.targetAccountId && !mergeTarget ? <p className={styles.hint}>Loading target account identities…</p> : null}{mergeTarget ? <><p className={styles.hint}>Merging account {selected.id} into account {mergeTarget.id}. Select the retained identity for each provider.</p><div className={styles.mergeOwners}>{[selected, mergeTarget].map(account => <article key={account.id}><strong>Account {account.id}{account.id === mergeTarget.id ? " (retained)" : " (merged)"}</strong>{account.identities.filter(identity => identity.active !== false).map(identity => <span key={`${identity.provider}-${subject(identity)}`}>{String(identity.provider).toUpperCase()}: {identity.displayName || subject(identity)} <small>{subject(identity)}</small></span>)}</article>)}</div></> : null}<div className={styles.formRow}><label>Retain Discord identity<select required value={draft.discordSubject} onChange={e => editDraft({discordSubject: e.target.value})}><option value="">Select identity</option>{discordMergeOptions.map(option => <option key={`${option.value}-${option.accountId ?? "none"}`} value={option.value}>{option.label}</option>)}</select></label><label>Retain IFC identity<select required value={draft.ifcSubject} onChange={e => editDraft({ifcSubject: e.target.value})}><option value="">Select identity</option>{ifcMergeOptions.map(option => <option key={`${option.value}-${option.accountId ?? "none"}`} value={option.value}>{option.label}</option>)}</select></label></div></div> : null}
                    {draft.operation === "SUSPEND" ? <label>Optional suspension expiry<input type="datetime-local" value={draft.suspensionUntil} onChange={e => editDraft({suspensionUntil: e.target.value})}/></label> : null}
                    <button type="submit" disabled={!mergeReady}>Preview action</button>
                </form>
                <AccountMutationConfirmation preview={preview} reason={reason} onReason={value => setMutation(current => mutationUiReducer(current, {type: "SET_REASON", reason: value}))} onCommit={() => void commit()} onCancel={() => setMutation(current => mutationUiReducer(current, {type: "CANCEL_PREVIEW"}))}/>
                <div className={styles.historyGrid}><RecordList title="Sessions" rows={selected.sessions}/><RecordList title="Link and conflict history" rows={selected.linkHistory}/><RecordList title="Login history" rows={selected.loginHistory}/><RecordList title="Management audits" rows={selected.managementAudits}/></div>
            </> : <p className={styles.muted}>Select an account to view identities, security history and management actions.</p>}</section>
        </div>
    </main>;
}
