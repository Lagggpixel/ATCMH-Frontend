"use client";

import {useEffect, useRef, useState} from "react";
import type {AuditLog, AccountAuditLogPage} from "../../types/AuditLog";
import {ApiUtils} from "../../utils/ApiUtils";
import {formatAdminUtcDate} from "../../utils/AdminDateUtils";
import styles from "./AdminAccounts.module.css";

function detailsText(value: string) {
    try {return JSON.stringify(JSON.parse(value), null, 2);}
    catch {return value;}
}

export function AccountAuditLogEntries({logs}: {logs: AuditLog[]}) {
    return logs.length ? <div className={styles.recordList}>{logs.map(log => <details key={log.id}>
        <summary>{formatAdminUtcDate(log.createdAt)} · {log.action}</summary>
        <p>{log.summary}</p>
        <dl><div><dt>Source</dt><dd>{log.source}</dd></div>
            <div><dt>Actor</dt><dd>{log.actorName || "System"}{log.actorId ? ` · ${log.actorId}` : ""}</dd></div>
            <div><dt>Target</dt><dd>{log.targetType || "None"}{log.targetId ? ` · ${log.targetId}` : ""}</dd></div>
            <div><dt>Audit ID</dt><dd>{log.id}</dd></div></dl>
        {log.detailsJson ? <pre>{detailsText(log.detailsJson)}</pre> : null}
    </details>)}</div> : <p className={styles.muted}>No audit logs recorded for this account.</p>;
}

export default function AccountAuditLogs({accountId, token}: {accountId: string; token: string}) {
    const [page, setPage] = useState<AccountAuditLogPage>();
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    const generation = useRef(0);
    useEffect(() => {
        const current = ++generation.current;
        setPage(undefined); setError(undefined); setBusy(true);
        void ApiUtils.getAccountAuditLogs(token, accountId).then(value => {
            if (generation.current === current) setPage(value);
        }).catch(() => {
            if (generation.current === current) setError("Audit logs could not be loaded. Please retry.");
        }).finally(() => {if (generation.current === current) setBusy(false);});
        return () => {generation.current = current + 1;};
    }, [accountId, token, reload]);
    const loadOlder = async () => {
        if (!page?.nextBeforeId || busy) return;
        const current = generation.current;
        setBusy(true); setError(undefined);
        try {
            const older = await ApiUtils.getAccountAuditLogs(token, accountId, page.nextBeforeId);
            if (generation.current === current) setPage({logs: [...page.logs, ...older.logs], nextBeforeId: older.nextBeforeId});
        } catch {
            if (generation.current === current) setError("Older audit logs could not be loaded. Please retry.");
        } finally {if (generation.current === current) setBusy(false);}
    };
    return <section className={styles.recordSection} aria-label="Account audit logs" aria-busy={busy}>
        <div className={styles.sectionHeading}><h3>Audit logs</h3><p>Activity performed by this account or directly targeting its account or Discord identities, including archived identities. Newest recorded entries appear first.</p></div>
        {page ? <AccountAuditLogEntries logs={page.logs}/> : null}
        {busy ? <p role="status">Loading audit logs…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {!page && error ? <button type="button" className={styles.auditButton} onClick={() => setReload(value => value + 1)}>Retry audit logs</button> : null}
        {page?.nextBeforeId ? <button type="button" className={styles.auditButton} disabled={busy} onClick={() => void loadOlder()}>{busy ? "Loading…" : "Load older entries"}</button> : null}
    </section>;
}
