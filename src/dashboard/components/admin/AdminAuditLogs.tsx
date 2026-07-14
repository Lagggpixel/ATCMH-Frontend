import {type FormEvent, useCallback, useEffect, useMemo, useState} from "react";
import type {AdminUser} from "../../types/AdminUser.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import type {AuditLog, AuditLogFilterMetadata} from "../../types/AuditLog.ts";
import {formatAdminUtcDate, parseUtcDateTimeInput} from "../../utils/AdminDateUtils.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import AdminToast from "./AdminToast.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import styles from "./AdminAuditLogs.module.css";
import {useTableSort} from "../../hooks/useTableSort.ts";
import {usePagination} from "../../hooks/usePagination.ts";
import AdminPagination from "./AdminPagination.tsx";

interface AdminAuditLogsProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    users: AtcmhUser[] | undefined;
    adminUser: AdminUser | undefined;
    token: string | null;
}

const emptyFilters = {
    source: "",
    action: "",
    actorId: "",
    targetType: "",
    targetId: "",
    from: "",
    to: "",
    limit: "1000"
};

const toSubmittedFilters = (filters: typeof emptyFilters) => ({
    ...filters,
    from: filters.from ? parseUtcDateTimeInput(filters.from) : "",
    to: filters.to ? parseUtcDateTimeInput(filters.to) : "",
});

export function ProjectedAuditRow({log, actor, onDetails}: {log: AuditLog; actor: string; onDetails: (id: number) => void}) {
    const details = log.detailsJson?.trim();
    return <tr><td data-label="Time">{formatAdminUtcDate(log.createdAt)}</td><td data-label="Source"><span className={styles.sourceBadge}>{log.source}</span></td><td data-label="Actor">{actor}{log.actorId ? <span className={styles.metaText}> {log.actorId}</span> : null}</td><td data-label="Action"><code>{log.action}</code></td><td data-label="Target">{log.targetType || "None"}{log.targetId ? <span className={styles.metaText}> {log.targetId}</span> : null}</td><td className={styles.summaryCell} data-label="Summary">{log.summary}</td><td data-label="Details">{details ? <button className={styles.detailsToggle} type="button" onClick={() => onDetails(log.id)} aria-haspopup="dialog">View</button> : <span className={styles.metaText}>None</span>}</td></tr>;
}

const AdminAuditLogs = ({loaded, loggedIn, error, users, adminUser, token}: AdminAuditLogsProps) => {
    const [logs, setLogs] = useState<AuditLog[] | undefined>(undefined);
    const [auditError, setAuditError] = useState<string | undefined>(undefined);
    const [isLoadingAudit, setIsLoadingAudit] = useState(false);
    const [filterMetadata, setFilterMetadata] = useState<AuditLogFilterMetadata | undefined>(undefined);
    const [filters, setFilters] = useState(emptyFilters);
    const [submittedFilters, setSubmittedFilters] = useState(toSubmittedFilters(emptyFilters));
    const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

    const usersById = useMemo(() => new Map(users?.map(user => [user.id, user]) ?? []), [users]);

    const getUserName = useCallback((id?: string | null, fallback?: string | null) => {
        if (id == null) return fallback || "System";
        return usersById.get(id)?.username ?? fallback ?? `User (${id})`;
    }, [usersById]);

    useEffect(() => {
        if (!token || !adminUser?.canViewAuditLogs) {
            setLogs(undefined);
            return;
        }

        let isCurrent = true;
        setIsLoadingAudit(true);
        setAuditError(undefined);
        ApiUtils.getAuditLogs(token, submittedFilters)
            .then(data => {
                if (isCurrent) setLogs(data);
            })
            .catch(err => {
                if (isCurrent) setAuditError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
                if (isCurrent) setIsLoadingAudit(false);
            });

        return () => {
            isCurrent = false;
        };
    }, [adminUser?.canViewAuditLogs, submittedFilters, token]);

    useEffect(() => {
        if (!token || !adminUser?.canViewAuditLogs) {
            setFilterMetadata(undefined);
            return;
        }

        let isCurrent = true;
        ApiUtils.getAuditLogFilters(token)
            .then(data => {
                if (isCurrent) setFilterMetadata(data);
            })
            .catch(err => {
                if (isCurrent) setAuditError(err instanceof Error ? err.message : String(err));
            });

        return () => {
            isCurrent = false;
        };
    }, [adminUser?.canViewAuditLogs, token]);

    const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const {name, value} = event.target;
        setFilters(previous => ({...previous, [name]: value}));
    };

    const applyFilters = (event: FormEvent) => {
        event.preventDefault();
        setSubmittedFilters(toSubmittedFilters(filters));
    };

    const clearFilters = () => {
        setFilters(emptyFilters);
        setSubmittedFilters(toSubmittedFilters(emptyFilters));
        setSelectedLogId(null);
    };

    const formatDetails = (detailsJson?: string | null) => {
        if (!detailsJson?.trim()) return "";
        try {
            return JSON.stringify(JSON.parse(detailsJson), null, 2);
        } catch {
            return detailsJson;
        }
    };

    const logRecords = useMemo(() => (logs ?? []).map(log => ({
        time: log.createdAt,
        source: log.source,
        actor: getUserName(log.actorId, log.actorName),
        actorDisplayId: log.actorId,
        action: log.action,
        targetType: log.targetType || "None",
        targetId: log.targetId ?? "",
        summary: log.summary,
        id: log.id,
    })), [logs, getUserName]);

    const {sortState, sortedData, handleSort} = useTableSort(
        "time",
        "desc",
        logRecords
    );

    const selectedLog = useMemo(() => logs?.find(log => log.id === selectedLogId), [logs, selectedLogId]);
    const selectedLogActor = selectedLog ? getUserName(selectedLog.actorId, selectedLog.actorName) : "";
    const selectedLogDetails = selectedLog ? formatDetails(selectedLog.detailsJson) : "";

    useEffect(() => {
        if (!selectedLog) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setSelectedLogId(null);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedLog]);

    const [currentPage, setCurrentPage] = useState(25);

    const pagination = usePagination(sortedData, currentPage);
    const handlePageSizeChange = (newPerPage: number) => {
        setCurrentPage(newPerPage);
        pagination.reset();
    };

    if (!loggedIn) return <AdminLoginScreen/>;
    if (!loaded) return <AdminLoadingScreen/>;
    if (error) return <AdminErrorScreen content={error}/>;
    if (!users || !adminUser?.canViewAuditLogs) return <AdminUnauthorizedScreen/>;

    return (
        <div className={styles.adminAuditLogsContainer}>
            <form className={styles.auditFilters} onSubmit={applyFilters}>
                <label>
                    Source
                    <select name="source" value={filters.source} onChange={handleFilterChange}>
                        <option value="">All sources</option>
                        {filterMetadata?.sources.map(source => <option key={source} value={source}>{source}</option>)}
                    </select>
                </label>
                <label>
                    Action
                    <select name="action" value={filters.action} onChange={handleFilterChange}>
                        <option value="">All actions</option>
                        {filterMetadata?.actions.map(action => <option key={action} value={action}>{action}</option>)}
                    </select>
                </label>
                <label>
                    Actor
                    <select name="actorId" value={filters.actorId} onChange={handleFilterChange}>
                        <option value="">All actors</option>
                        {filterMetadata?.actors.map(actor => <option key={actor.id} value={actor.id}>{actor.name} ({actor.id})</option>)}
                    </select>
                </label>
                <label>
                    Target type
                    <select name="targetType" value={filters.targetType} onChange={handleFilterChange}>
                        <option value="">All target types</option>
                        {filterMetadata?.targetTypes.map(targetType => <option key={targetType} value={targetType}>{targetType}</option>)}
                    </select>
                </label>
                <label>
                    Target ID
                    <input name="targetId" value={filters.targetId} onChange={handleFilterChange} placeholder="ID"/>
                </label>
                <label>
                    From
                    <input name="from" type="datetime-local" value={filters.from} onChange={handleFilterChange}/>
                </label>
                <label>
                    To
                    <input name="to" type="datetime-local" value={filters.to} onChange={handleFilterChange}/>
                </label>
                <label>
                    Limit
                    <select name="limit" value={filters.limit} onChange={handleFilterChange}>
                        <option value="100">100</option>
                        <option value="200">200</option>
                        <option value="500">500</option>
                        <option value="1000">1,000</option>
                        <option value="all">All</option>
                    </select>
                </label>
                <div className={styles.auditFilterActions}>
                    <button type="submit">Apply</button>
                    <button type="button" onClick={clearFilters}>Clear</button>
                </div>
            </form>

            <AdminToast message={auditError} onDismiss={() => setAuditError(undefined)}/>
            {isLoadingAudit && <div className={styles.auditLoading}>Loading audit logs...</div>}

            <div className={styles.auditTableWrap}>
                <table className={styles.auditTable}>
                    <thead>
                    <tr>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("time")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("time");}}} aria-sort={sortState.column==="time" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Time <span className={`${styles.sortIndicator} ${sortState.column==="time" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="time" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("source")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("source");}}} aria-sort={sortState.column==="source" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Source <span className={`${styles.sortIndicator} ${sortState.column==="source" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="source" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("actor")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("actor");}}} aria-sort={sortState.column==="actor" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Actor <span className={`${styles.sortIndicator} ${sortState.column==="actor" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="actor" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("action")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("action");}}} aria-sort={sortState.column==="action" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Action <span className={`${styles.sortIndicator} ${sortState.column==="action" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="action" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("targetType")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("targetType");}}} aria-sort={sortState.column==="targetType" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Target <span className={`${styles.sortIndicator} ${sortState.column==="targetType" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="targetType" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("summary")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("summary");}}} aria-sort={sortState.column==="summary" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Summary <span className={`${styles.sortIndicator} ${sortState.column==="summary" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="summary" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col">Details</th>
                    </tr>
                    </thead>
                    <tbody>
                    {(pagination.paginatedItems).length > 0 ? pagination.paginatedItems.map((record) => {
                        const log = logs?.find(l => l.id === record.id);
                        if (!log) return null;
                        return <ProjectedAuditRow key={log.id} log={log} actor={record.actor} onDetails={setSelectedLogId}/>;
                    }).filter(Boolean) : (
                        <tr>
                            <td className={styles.auditEmpty} colSpan={7}>No audit logs match these filters.</td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
            <AdminPagination
                {...pagination}
                totalItems={sortedData.length}
                onItemsPerPageChange={handlePageSizeChange}
            />
            {selectedLog ? (
                <div className={styles.detailsModalBackdrop} onClick={() => setSelectedLogId(null)}>
                    <section
                        className={styles.detailsModal}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="audit-log-details-title"
                        onClick={event => event.stopPropagation()}
                    >
                        <header className={styles.detailsModalHeader}>
                            <div>
                                <h2 id="audit-log-details-title">Audit Log Details</h2>
                                <p>{selectedLog.summary}</p>
                            </div>
                            <button
                                className={styles.detailsModalClose}
                                type="button"
                                onClick={() => setSelectedLogId(null)}
                                aria-label="Close audit log details"
                            >
                                Close
                            </button>
                        </header>
                        <dl className={styles.detailsModalMeta}>
                            <div>
                                <dt>Time</dt>
                                <dd>{formatAdminUtcDate(selectedLog.createdAt)}</dd>
                            </div>
                            <div>
                                <dt>Source</dt>
                                <dd>{selectedLog.source}</dd>
                            </div>
                            <div>
                                <dt>Actor</dt>
                                <dd>{selectedLogActor}{selectedLog.actorId ? <span className={styles.metaText}> {selectedLog.actorId}</span> : null}</dd>
                            </div>
                            <div>
                                <dt>Action</dt>
                                <dd><code>{selectedLog.action}</code></dd>
                            </div>
                            <div>
                                <dt>Target</dt>
                                <dd>{selectedLog.targetType || "None"}{selectedLog.targetId ? <span className={styles.metaText}> {selectedLog.targetId}</span> : null}</dd>
                            </div>
                        </dl>
                        <pre className={styles.detailsModalBody}>{selectedLogDetails}</pre>
                    </section>
                </div>
            ) : null}
        </div>
    );
};

export default AdminAuditLogs;
