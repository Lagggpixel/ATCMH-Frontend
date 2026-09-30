import {type FormEvent, useEffect, useMemo, useRef, useState} from "react";
import {AirplaneIcon} from "@phosphor-icons/react/Airplane";
import {ArrowLeftIcon} from "@phosphor-icons/react/ArrowLeft";
import {CaretRightIcon} from "@phosphor-icons/react/CaretRight";
import {CheckIcon} from "@phosphor-icons/react/Check";
import {CircleIcon} from "@phosphor-icons/react/Circle";
import {CopyIcon} from "@phosphor-icons/react/Copy";
import {DiscordLogoIcon} from "@phosphor-icons/react/DiscordLogo";
import {MagnifyingGlassIcon} from "@phosphor-icons/react/MagnifyingGlass";
import {UsersIcon} from "@phosphor-icons/react/Users";
import {XIcon} from "@phosphor-icons/react/X";
import {useSearchParams} from "@/src/dashboard/next-navigation";
import type {AccountDetail, AccountIdentity, AccountSummary, AdminMutationPreview, AdminOperation} from "../../types/Account.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import {archivedMergeIdentityOptions, buildMutationRequest, createMutationUiState, mergeIdentityOptions, mutationUiReducer, type MutationDraft} from "../../utils/AccountMutationUtils.ts";
import {availableUserName} from "@/src/lib/user-display-name";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import styles from "./AdminAccounts.module.css";

const operations: Array<{value: AdminOperation; label: string}> = [
    {value: "LINK", label: "Link identity"}, {value: "REASSIGN", label: "Reassign identity"},
    {value: "UNLINK", label: "Unlink identity"}, {value: "MERGE", label: "Merge into another account"},
    {value: "SWAP_MERGE_IDENTITY", label: "Switch merged identity"},
    {value: "SUSPEND", label: "Suspend"}, {value: "RESTORE", label: "Restore"},
    {value: "DELETE", label: "Soft delete"}, {value: "LOGOUT_ALL", label: "Log out all sessions"},
    {value: "IMPERSONATE_DASHBOARD", label: "Impersonate account"},
];

const subject = (identity: AccountIdentity) => identity.providerSubject ?? identity.subject;
const identityLabel = (identity: AccountIdentity) => availableUserName(identity.displayName) ?? subject(identity);
const formatCell = (value: unknown) => value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
const statusLabel = (status: string) => status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
const accountName = (account: AccountSummary) => {
    const active = account.identities.filter(identity => identity.active !== false);
    return active.map(identity => availableUserName(identity.displayName)).find(Boolean) ?? (active[0] ? identityLabel(active[0]) : "Unlinked account");
};
const detailTabs = [{id: "overview", label: "Overview"}, {id: "history", label: "History"}, {id: "management", label: "Management"}] as const;
type DetailTab = typeof detailTabs[number]["id"];

function StatusBadge({status}: {status: string}) {
    return <span className={styles.status} data-status={status.toUpperCase()}><CircleIcon size={8} weight="fill" aria-hidden="true"/>{statusLabel(status)}</span>;
}

function ProviderIcon({provider}: {provider: string}) {
    return <span className={styles.providerIcon} data-provider={provider.toLowerCase()}>{provider.toLowerCase() === "discord" ? <DiscordLogoIcon size={21} weight="fill" aria-hidden="true"/> : <AirplaneIcon size={21} weight="fill" aria-hidden="true"/>}</span>;
}

export function AccountOverview({account, canViewIpAddresses}: {account: AccountDetail; canViewIpAddresses: boolean}) {
    const loginTimes = account.loginHistory.map(row => new Date(String(row.createdAt ?? row.occurredAt ?? "")).getTime()).filter(Number.isFinite);
    const lastLogin = loginTimes.length ? new Date(Math.max(...loginTimes)).toLocaleString() : "No recorded logins";
    const lastAddress = canViewIpAddresses ? account.ipAddresses?.reduce<NonNullable<AccountDetail["ipAddresses"]>[number] | undefined>((latest, address) => !latest || new Date(address.lastSeen) > new Date(latest.lastSeen) ? address : latest, undefined) : undefined;
    return <dl className={styles.overview}><div><dt>Account ID</dt><dd>{account.id}</dd></div><div><dt>Status</dt><dd><StatusBadge status={account.status}/></dd></div><div><dt>Created</dt><dd>{new Date(account.createdAt).toLocaleString()}</dd></div><div><dt>Last login</dt><dd>{lastLogin}</dd></div>{canViewIpAddresses ? <div><dt>Last seen IP</dt><dd>{lastAddress?.ip ?? "No recorded IP addresses"}</dd></div> : null}<div><dt>Linked identities</dt><dd>{account.identities.filter(identity => identity.active !== false).length}</dd></div>{account.mergeTargetAccountId ? <div><dt>Merged into</dt><dd>{account.mergeTargetAccountId}</dd></div> : null}<div><dt>Updated</dt><dd>{new Date(account.updatedAt).toLocaleString()}</dd></div><div><dt>Version</dt><dd>{account.version}</dd></div></dl>;
}

export function AccountResultsTable({accounts, selectedId, openingId, onOpen}: {accounts: AccountSummary[]; selectedId?: string; openingId?: string | null; onOpen: (id: string) => void}) {
    return <table className={styles.accountTable}><thead><tr><th scope="col">Account</th><th scope="col">Discord identity</th><th scope="col">IFC identity</th><th scope="col">Status</th><th scope="col"><span className={styles.srOnly}>View account</span></th></tr></thead><tbody>{accounts.map(account => {
        const providerIdentity = (provider: string) => account.identities.find(identity => identity.provider.toLowerCase() === provider && identity.active !== false);
        const discord = providerIdentity("discord");
        const ifc = providerIdentity("ifc");
        return <tr key={account.id} data-selected={selectedId === account.id} onClick={() => { if (openingId !== account.id) onOpen(account.id); }}>
            <td><button type="button" aria-label={`View ${accountName(account)}, account ${account.id}`} aria-current={selectedId === account.id ? "true" : undefined} disabled={openingId === account.id}><strong>{accountName(account)}</strong><small>Account ID: {account.id}</small></button></td>
            <td data-label="Discord">{discord ? <div className={styles.tableIdentity}><ProviderIcon provider="discord"/><div><span>{identityLabel(discord)}</span><small title={subject(discord)}>{subject(discord)}</small></div></div> : <span className={styles.muted}>Not linked</span>}</td>
            <td data-label="IFC">{ifc ? <div className={styles.tableIdentity}><ProviderIcon provider="ifc"/><div><span>{identityLabel(ifc)}</span><small title={subject(ifc)}>{subject(ifc)}</small></div></div> : <span className={styles.muted}>Not linked</span>}</td>
            <td><StatusBadge status={account.status}/></td><td><CaretRightIcon size={18} aria-hidden="true"/></td>
        </tr>;
    })}</tbody></table>;
}

function RecordList({title, rows}: {title: string; rows: Record<string, unknown>[]}) {
    return <section className={styles.recordSection}><h3>{title} <span>{rows.length}</span></h3>{rows.length ? <div className={styles.recordList}>{rows.map((row, index) => <details key={`${title}-${index}`}><summary>{formatCell(row.action ?? row.operation ?? row.outcome ?? row.kind ?? row.application ?? row.id)}{row.occurredAt ? ` · ${new Date(String(row.occurredAt)).toLocaleString()}` : ""}</summary><dl>{Object.entries(row).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{formatCell(value)}</dd></div>)}</dl></details>)}</div> : <p className={styles.muted}>No records.</p>}</section>;
}

export function AccountIpAddresses({addresses, canView}: {addresses: AccountDetail["ipAddresses"]; canView: boolean}) {
    if (!canView) return null;
    return <section className={styles.recordSection}><h3>IP addresses <span>{addresses?.length ?? 0}</span></h3>{addresses?.length ? <div className={styles.ipTableWrap}><table className={styles.ipTable}><thead><tr><th scope="col">IP address</th><th scope="col">First seen</th><th scope="col">Last seen</th><th scope="col">Events</th></tr></thead><tbody>{addresses.map(address => <tr key={address.ip}><td><code>{address.ip}</code></td><td>{new Date(address.firstSeen).toLocaleString()}</td><td>{new Date(address.lastSeen).toLocaleString()}</td><td>{address.count}</td></tr>)}</tbody></table></div> : <p className={styles.muted}>No recorded IP addresses.</p>}</section>;
}

export function AccountRequestError({error}: {error: string | null}) {
    return error ? <div className={styles.error} role="alert"><strong>Request not completed</strong><span>{error}</span><small>A conflict or stale preview never changes account ownership. Reload the account before trying again.</small></div> : null;
}

export function AccountMutationConfirmation({preview, reason, onReason, onCommit, onCancel, busy = false}: {preview: AdminMutationPreview | null; reason: string; onReason: (value: string) => void; onCommit: () => void; onCancel: () => void; busy?: boolean}) {
    return preview ? <section className={styles.preview} aria-label="Confirmation preview"><p className={styles.eyebrow}>Confirmation preview</p><h3>{operations.find(operation => operation.value === preview.operation)?.label ?? preview.operation.replace(/_/g, " ")}</h3><p>Account {preview.sourceAccountId}{preview.targetAccountId ? ` → account ${preview.targetAccountId}` : ""}</p><p className={styles.hint}>Version {preview.sourceVersion}{preview.targetVersion != null ? ` / ${preview.targetVersion}` : ""}; expires {new Date(preview.expiresAt).toLocaleTimeString()}</p><pre>{JSON.stringify(preview.parameters, null, 2)}</pre><label>Required reason<textarea required maxLength={512} value={reason} placeholder="Explain why this account change is needed." onChange={event => onReason(event.target.value)}/></label><div><button type="button" className={styles.dangerButton} disabled={busy || !reason.trim()} onClick={onCommit}>{busy ? "Confirming…" : "Confirm action"}</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div></section> : null;
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
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<DetailTab>("overview");
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const selectionRequest = useRef(0);
    const searchRequest = useRef(0);
    const detailHeading = useRef<HTMLHeadingElement>(null);
    const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setCopied(false);
        if (selected && window.matchMedia("(max-width: 900px)").matches) detailHeading.current?.focus();
    }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
    const copyAccountId = async () => {
        if (!selected) return;
        try {
            await navigator.clipboard.writeText(selected.id);
            setCopied(true);
            if (copyTimer.current) clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopied(false), 2000);
        } catch { setError("The account ID could not be copied. Select the ID and copy it manually."); }
    };
    const closeDetail = () => {
        selectionRequest.current += 1;
        setOpeningId(null);
        setSelected(null);
        setMutation(createMutationUiState());
        setMergeTarget(null);
        setMergeTargetError(null);
        setActiveTab("overview");
    };

    const search = async () => {
        if (!csrfToken) return;
        const request = ++searchRequest.current;
        setLoading(true); setError(null);
        try { const results = await ApiUtils.searchAccounts(csrfToken, filters); if (request === searchRequest.current) setAccounts(results); }
        catch (cause) { if (request === searchRequest.current) setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { if (request === searchRequest.current) setLoading(false); }
    };
    useEffect(() => { if (adminUser?.canManageAccounts) void search(); }, [adminUser?.canManageAccounts, csrfToken]); // eslint-disable-line react-hooks/exhaustive-deps
    const open = async (id: string, preserveTab = false) => {
        if (!csrfToken) return;
        const request = ++selectionRequest.current;
        setError(null);
        setOpeningId(id);
        try {
            const detail = await ApiUtils.getAccount(csrfToken, id);
            if (request !== selectionRequest.current) return;
            setSelected(detail); if (!preserveTab) setActiveTab("overview"); setMergeTarget(null); setMergeTargetError(null);
            setMutation(current => mutationUiReducer(current, {type: "SELECT_ACCOUNT", accountId: id}));
        }
        catch (cause) { if (request === selectionRequest.current) setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { if (request === selectionRequest.current) setOpeningId(null); }
    };

    useEffect(() => {
        if (!adminUser?.canManageAccounts || !csrfToken || !linkedAccountId) return;
        void open(linkedAccountId);
    }, [adminUser?.canManageAccounts, csrfToken, linkedAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

    const submitPreview = async (event: FormEvent) => {
        event.preventDefault(); if (!csrfToken || actionBusy) return;
        setActionBusy(true);
        setError(null);
        try { const nextPreview = await ApiUtils.previewAccountMutation(csrfToken, buildMutationRequest(draft)); setMutation(current => mutationUiReducer(current, {type: "PREVIEW_RECEIVED", preview: nextPreview})); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setActionBusy(false); }
    };
    const commit = async () => {
        if (!csrfToken || !preview || !reason.trim() || actionBusy) return;
        setActionBusy(true);
        setError(null);
        try {
            const result = await ApiUtils.commitAccountMutation(csrfToken, preview.token, reason.trim());
            if (result.operation === "IMPERSONATE_DASHBOARD" || result.operation === "IMPERSONATE_EXAMS") { await onSessionChanged(); window.location.assign("/account"); return; }
            setMutation(current => mutationUiReducer(current, {type: "CANCEL_PREVIEW"})); await search(); await open(draft.sourceAccountId, true);
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setActionBusy(false); }
    };

    useEffect(() => {
        setMergeTarget(null); setMergeTargetError(null);
        if (!["MERGE", "SWAP_MERGE_IDENTITY"].includes(draft.operation) || !csrfToken || !draft.targetAccountId || draft.targetAccountId === draft.sourceAccountId) return;
        let current = true;
        const timer = window.setTimeout(() => void ApiUtils.getAccount(csrfToken, draft.targetAccountId).then(detail => {if (current) setMergeTarget(detail);}).catch(cause => {if (current) setMergeTargetError(cause instanceof Error ? cause.message : String(cause));}), 250);
        return () => {current = false; window.clearTimeout(timer);};
    }, [csrfToken, draft.operation, draft.sourceAccountId, draft.targetAccountId]);
    const discordMergeOptions = useMemo(() => selected ? mergeIdentityOptions(selected, mergeTarget, "discord") : [], [mergeTarget, selected]);
    const ifcMergeOptions = useMemo(() => selected ? mergeIdentityOptions(selected, mergeTarget, "ifc") : [], [mergeTarget, selected]);
    const swapIdentityOptions = useMemo(() => selected ? archivedMergeIdentityOptions(selected, mergeTarget, draft.provider.toLowerCase() as "discord" | "ifc") : [], [draft.provider, mergeTarget, selected]);
    const mergeReady = draft.operation !== "MERGE" || (mergeTarget != null && !mergeTargetError && Boolean(draft.discordSubject) && Boolean(draft.ifcSubject));
    const swapReady = draft.operation !== "SWAP_MERGE_IDENTITY" || (selected?.status === "MERGED" && draft.targetAccountId === selected.mergeTargetAccountId && mergeTarget != null && !mergeTargetError && Boolean(draft.subject));
    const actionReady = draft.operation === "MERGE" ? mergeReady : draft.operation === "SWAP_MERGE_IDENTITY" ? swapReady : true;
    if (!loaded) return <AdminLoadingScreen/>;
    if (!adminUser?.canManageAccounts) return <AdminUnauthorizedScreen/>;
    return <main className={styles.page} data-detail-open={selected !== null}>
        <AccountRequestError error={error}/>
        <button type="button" className={styles.mobileBack} disabled={actionBusy} onClick={closeDetail}><ArrowLeftIcon size={18} aria-hidden="true"/>Back to accounts</button>
        <div className={styles.directory}>
        <header className={styles.heading}><h2>Accounts</h2><p>Find and manage user accounts, view linked identities and inspect account history.</p></header>
        <form className={styles.filters} onSubmit={event => {event.preventDefault(); void search();}}>
            <label>Account ID<input placeholder="Enter an account ID" value={filters.accountId} onChange={e => setFilters({...filters, accountId: e.target.value})}/></label>
            <label>Discord ID or name<input placeholder="Discord ID or username" value={filters.discord} onChange={e => setFilters({...filters, discord: e.target.value})}/></label>
            <button type="button" className={styles.mobileFiltersToggle} aria-expanded={filtersOpen} aria-controls="account-extra-filters" onClick={() => setFiltersOpen(open => !open)}>{filtersOpen ? "Hide filters" : "More filters"}</button>
            <div id="account-extra-filters" className={styles.secondaryFilters} data-open={filtersOpen}>
            <label>IFC ID or name<input placeholder="IFC ID or username" value={filters.ifc} onChange={e => setFilters({...filters, ifc: e.target.value})}/></label>
            <label>Status<select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}><option value="">Any status</option>{["ACTIVE", "SUSPENDED", "DELETED", "MERGED"].map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
            <label>Identity<select value={filters.identityActive} onChange={e => setFilters({...filters, identityActive: e.target.value})}><option value="">Any</option><option value="true">Active</option><option value="false">Archived</option></select></label>
            </div>
            <button type="submit" disabled={loading}>{loading ? "Searching…" : "Search accounts"}</button>
        </form>
        <div className={styles.layout}>
            <section className={styles.results} aria-label="Account search results" aria-busy={loading || openingId != null}>
                <div className={styles.resultsHeading}><p className={styles.srOnly} role="status">{loading ? "Searching accounts…" : `${accounts.length} search result${accounts.length === 1 ? "" : "s"}`}</p>{openingId ? <span role="status">Opening account…</span> : null}</div>
                {accounts.length ? <div className={styles.tableScroll} tabIndex={0} aria-label="Scrollable account directory"><AccountResultsTable accounts={accounts} selectedId={selected?.id} openingId={openingId} onOpen={id => { if (!actionBusy) void open(id); }}/></div> : <div className={styles.emptyResults}><MagnifyingGlassIcon size={28} aria-hidden="true"/><strong>{loading ? "Finding accounts" : "No matching accounts"}</strong><p>{loading ? "Your search results will appear here." : "Try a different account ID, username or filter."}</p></div>}
            </section>
        </div>
        </div>
            <section className={styles.detail} aria-label="Account details">{selected ? <>
                <header className={styles.detailHeader}><div><div className={styles.accountTitle}><h2 ref={detailHeading} tabIndex={-1}>{accountName(selected)}</h2></div><div className={styles.accountId}><span>Account ID: <code>{selected.id}</code></span><button type="button" className={styles.copyButton} aria-label={copied ? "Account ID copied" : "Copy account ID"} onClick={() => void copyAccountId()}>{copied ? <CheckIcon size={18}/> : <CopyIcon size={18}/>}</button><span className={styles.srOnly} role="status">{copied ? "Account ID copied" : ""}</span></div></div><button type="button" className={styles.closeButton} aria-label="Close account details" disabled={actionBusy} onClick={closeDetail}><XIcon size={20}/></button></header>
                <div className={styles.statusSummary}><StatusBadge status={selected.status}/><span>Created {new Date(selected.createdAt).toLocaleDateString()}</span></div>
                {selected.suspensionReason ? <p className={styles.warning}>Suspended: {selected.suspensionReason}{selected.suspendedUntil ? ` until ${new Date(selected.suspendedUntil).toLocaleString()}` : ""}</p> : null}
                {selected.mergeTargetAccountId ? <p className={styles.warning}>Merged into account {selected.mergeTargetAccountId}.</p> : null}
                <section className={styles.identitySection} aria-label="Linked identities"><h3>Linked identities</h3><div className={styles.identities}>{selected.identities.length ? selected.identities.map(identity => <article key={`${identity.provider}-${subject(identity)}-${identity.id ?? ""}`}><ProviderIcon provider={identity.provider}/><div><strong>{identityLabel(identity)}</strong><small>{identity.provider.toLowerCase() === "discord" ? "Discord" : "IFC"} · {subject(identity)}</small></div>{identity.active === false ? <StatusBadge status="ARCHIVED"/> : null}</article>) : <p className={styles.muted}>No linked identities.</p>}</div></section>
                <div className={styles.tabs} role="tablist" aria-label="Account detail sections">{detailTabs.map((tab, index) => <button key={tab.id} id={`account-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`account-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={event => {
                    const next = event.key === "ArrowRight" ? (index + 1) % detailTabs.length : event.key === "ArrowLeft" ? (index + detailTabs.length - 1) % detailTabs.length : event.key === "Home" ? 0 : event.key === "End" ? detailTabs.length - 1 : null;
                    if (next != null) { event.preventDefault(); setActiveTab(detailTabs[next].id); document.getElementById(`account-tab-${detailTabs[next].id}`)?.focus(); }
                }}>{tab.label}</button>)}</div>
                <div id={`account-panel-${activeTab}`} role="tabpanel" aria-labelledby={`account-tab-${activeTab}`} className={styles.tabPanel} tabIndex={0}>
                {activeTab === "overview" ? <AccountOverview account={selected} canViewIpAddresses={adminUser.canViewIpAddresses === true}/> : null}
                {activeTab === "management" ? <><div className={styles.sectionHeading}><h3>Management action</h3><p>Review a preview before confirming a change. A reason is required.</p></div><form className={styles.mutation} onSubmit={submitPreview}><fieldset disabled={actionBusy}>
                    <label>Action<select value={draft.operation} onChange={e => {const operation = e.target.value as AdminOperation; editDraft(operation === "SWAP_MERGE_IDENTITY" ? {operation, targetAccountId: selected.mergeTargetAccountId ?? "", subject: "", displayName: ""} : {operation});}}>{operations.filter(operation => (!operation.value.startsWith("IMPERSONATE") || adminUser.canImpersonate) && (operation.value !== "SWAP_MERGE_IDENTITY" || (selected.status === "MERGED" && Boolean(selected.mergeTargetAccountId)))).map(operation => <option value={operation.value} key={operation.value}>{operation.label}</option>)}</select></label>
                    {["LINK", "REASSIGN", "UNLINK"].includes(draft.operation) ? <div className={styles.formRow}><label>Provider<select value={draft.provider} onChange={e => editDraft({provider: e.target.value as "DISCORD" | "IFC", subject: ""})}><option>DISCORD</option><option>IFC</option></select></label><label>Provider subject<input required value={draft.subject} onChange={e => editDraft({subject: e.target.value})}/></label><label>Display name<input value={draft.displayName} onChange={e => editDraft({displayName: e.target.value})}/></label></div> : null}
                    {["MERGE", "REASSIGN", "SWAP_MERGE_IDENTITY"].includes(draft.operation) ? <label>{draft.operation === "MERGE" ? "Retained target account ID" : draft.operation === "SWAP_MERGE_IDENTITY" ? "Merge target account ID" : "Current owner account ID"}<input required readOnly={draft.operation === "SWAP_MERGE_IDENTITY"} value={draft.targetAccountId} onChange={e => editDraft({targetAccountId: e.target.value})}/></label> : null}
                    {draft.operation === "MERGE" ? <div className={styles.mergeChoices}>{mergeTargetError ? <p role="alert" className={styles.warning}>{mergeTargetError}</p> : draft.targetAccountId && !mergeTarget ? <p className={styles.hint}>Loading target account identities…</p> : null}{mergeTarget ? <><p className={styles.hint}>Merging account {selected.id} into account {mergeTarget.id}. Select the retained identity for each provider.</p><div className={styles.mergeOwners}>{[selected, mergeTarget].map(account => <article key={account.id}><strong>Account {account.id}{account.id === mergeTarget.id ? " (retained)" : " (merged)"}</strong>{account.identities.filter(identity => identity.active !== false).map(identity => <span key={`${identity.provider}-${subject(identity)}`}>{String(identity.provider).toUpperCase()}: {identityLabel(identity)} <small>{subject(identity)}</small></span>)}</article>)}</div></> : null}<div className={styles.formRow}><label>Retain Discord identity<select required value={draft.discordSubject} onChange={e => editDraft({discordSubject: e.target.value})}><option value="">Select identity</option>{discordMergeOptions.map(option => <option key={`${option.value}-${option.accountId ?? "none"}`} value={option.value}>{option.label}</option>)}</select></label><label>Retain IFC identity<select required value={draft.ifcSubject} onChange={e => editDraft({ifcSubject: e.target.value})}><option value="">Select identity</option>{ifcMergeOptions.map(option => <option key={`${option.value}-${option.accountId ?? "none"}`} value={option.value}>{option.label}</option>)}</select></label></div></div> : null}
                    {draft.operation === "SWAP_MERGE_IDENTITY" ? <div className={styles.mergeChoices}>{mergeTargetError ? <p role="alert" className={styles.warning}>{mergeTargetError}</p> : !mergeTarget ? <p className={styles.hint}>Loading merge target identities…</p> : null}<p className={styles.hint}>This promotes one archived identity from the merged account pair into retained account {draft.targetAccountId}. The target account’s current {draft.provider.toLowerCase()} identity will be archived. This does not undo the merge.</p><div className={styles.formRow}><label>Provider<select value={draft.provider} onChange={e => editDraft({provider: e.target.value as "DISCORD" | "IFC", subject: ""})}><option>DISCORD</option><option>IFC</option></select></label><label>Archived identity<select required disabled={!swapIdentityOptions.length} value={draft.subject} onChange={e => editDraft({subject: e.target.value})}><option value="">Select archived identity</option>{swapIdentityOptions.map(option => <option key={`${option.value}-${option.accountId ?? "none"}`} value={option.value}>{option.label}</option>)}</select></label></div>{!swapIdentityOptions.length ? <p className={styles.warning}>No archived {draft.provider.toLowerCase()} identities are available on either merged account.</p> : null}</div> : null}
                    {draft.operation === "SUSPEND" ? <label>Optional suspension expiry<input type="datetime-local" value={draft.suspensionUntil} onChange={e => editDraft({suspensionUntil: e.target.value})}/></label> : null}
                    <button type="submit" disabled={actionBusy || !actionReady}>{actionBusy ? "Preparing action…" : "Preview action"}</button>
                </fieldset></form>
                <AccountMutationConfirmation preview={preview} reason={reason} busy={actionBusy} onReason={value => setMutation(current => mutationUiReducer(current, {type: "SET_REASON", reason: value}))} onCommit={() => void commit()} onCancel={() => setMutation(current => mutationUiReducer(current, {type: "CANCEL_PREVIEW"}))}/></> : null}
                {activeTab === "history" ? <><div className={styles.sectionHeading}><h3>Security history</h3><p>Sessions, sign-ins and administrative changes for this account.</p></div><AccountIpAddresses addresses={selected.ipAddresses} canView={adminUser.canViewIpAddresses === true}/><div className={styles.historyGrid}><RecordList title="Sessions" rows={selected.sessions}/><RecordList title="Link and conflict history" rows={selected.linkHistory}/><RecordList title="Login history" rows={selected.loginHistory}/><RecordList title="Recent access history" rows={selected.accessHistory ?? []}/><RecordList title="Management audits" rows={selected.managementAudits}/></div></> : null}
                </div>
                {activeTab !== "management" ? <div className={styles.managementEntry}><button type="button" className={styles.manageButton} onClick={() => setActiveTab("management")}>Manage account<CaretRightIcon size={16} aria-hidden="true"/></button><p>Account changes require a preview and confirmation with a reason.</p></div> : null}
            </> : <div className={styles.emptyDetail}><UsersIcon size={32} aria-hidden="true"/><h2>Choose an account</h2><p>Select a result to review linked identities, security history and management actions.</p></div>}</section>
    </main>;
}
