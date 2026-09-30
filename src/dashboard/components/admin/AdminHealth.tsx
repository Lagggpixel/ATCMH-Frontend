"use client";

import {Fragment, useEffect, useState} from "react";
import {ArrowClockwise, Check, CheckCircle, Circle, Clock, Database, DiscordLogo, Hash, Info, Lightning, MagnifyingGlass, Package, ShieldCheck, Users, WarningCircle, CaretDown, CaretRight} from "@phosphor-icons/react";
import type {AdminUser} from "../../types/AdminUser";
import type {BotHealth, HealthJob} from "../../types/BotHealth";
import {ApiUtils} from "../../utils/ApiUtils";
import {canViewHealth, filterHealthJobs, healthLabel, healthUptime, jobDescriptions, needsAttention} from "../../utils/HealthUtils";
import AdminErrorScreen from "./AdminErrorScreen";
import AdminLoadingScreen from "./AdminLoadingScreen";
import AdminLoginScreen from "./AdminLoginScreen";
import styles from "./AdminHealth.module.css";

interface Props {
    loaded: boolean;
    loggedIn: boolean;
    adminUser?: AdminUser;
    token: string | null;
    frontendVersion: string;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {timeZone: "UTC", day: "numeric", month: "short", year: "numeric"});
const timeFormat = new Intl.DateTimeFormat("en-GB", {timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit"});

function Timestamp({value}: {value?: string | null}) {
    if (!value) return <span className={styles.muted}>Never</span>;
    const date = new Date(value);
    return <time dateTime={value} title={`${date.toISOString()} (UTC)`} className={styles.timestamp}>
        {dateFormat.format(date)}<small>{timeFormat.format(date)}</small>
    </time>;
}

function JobStatus({job}: {job: HealthJob}) {
    return <span className={styles.status} data-tone={job.state === "FAILED" ? "danger" : job.state === "HEALTHY" ? "success" : job.state === "RUNNING" ? "info" : "neutral"}>
        <Circle size={9} weight="fill" aria-hidden="true"/>{healthLabel(job.state)}{job.overdue ? <strong className={styles.overdue}>Overdue</strong> : null}
    </span>;
}

export function HealthContent({data, frontendVersion, refreshing, error, refresh}: {
    data?: BotHealth; frontendVersion: string; refreshing: boolean; error?: string; refresh: () => void;
}) {
    const [query, setQuery] = useState("");
    const [attentionOnly, setAttentionOnly] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const attentionCount = data?.jobs.filter(needsAttention).length ?? 0;
    const rows = filterHealthJobs(data?.jobs ?? [], query, attentionOnly);
    const problems = data?.dependencies.filter(resource => resource.problems.length > 0) ?? [];
    const operational = data?.status === "OPERATIONAL";
    const statusTitle = operational ? "Systems operational" : data?.status === "NEEDS_ATTENTION" ? "Needs attention" : "Connection unavailable";

    function toggleJob(name: string) {
        setExpanded(current => {
            const next = new Set(current);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    }

    return <main className={styles.container}>
        <header className={styles.heading}>
            <div><p className={styles.eyebrow}>Administration</p><h2>System health</h2><p className={styles.subtitle}>Live bot diagnostics</p></div>
            <div className={styles.refreshControls}>
                <button type="button" className={styles.refresh} disabled={refreshing} onClick={refresh}>
                    <ArrowClockwise size={19} aria-hidden="true"/>{refreshing ? "Refreshing…" : "Refresh"}
                </button>
                <div className={styles.updated} aria-live="polite">{data ? <><span>{error ? "Last successful update" : "Last updated"}</span><Timestamp value={data.checkedAt}/><small>UTC</small></> : <span>Waiting for snapshot</span>}</div>
            </div>
        </header>
        {error ? <div className={styles.error} role="alert"><WarningCircle size={22} aria-hidden="true"/><div><strong>Health could not be refreshed</strong><p>{error}</p>{data ? <p>The snapshot below is out of date. Refresh to try again.</p> : null}</div></div> : null}
        {!data ? <section className={styles.panel} aria-live="polite"><h3>{refreshing ? "Checking system health…" : "No snapshot available"}</h3><p>{refreshing ? "Checking the database, Discord connection, and scheduled jobs." : "Use Refresh to check again."}</p><p className={styles.muted}>Frontend version {frontendVersion}</p></section> : <>
            <section className={styles.overview} aria-label="System overview">
                <div className={styles.overall} data-tone={operational ? "success" : data.status === "UNAVAILABLE" ? "danger" : "warning"}>
                    <span className={styles.overallIcon}>{operational ? <Check size={27} weight="bold" aria-hidden="true"/> : <WarningCircle size={30} aria-hidden="true"/>}</span>
                    <div><h3>{statusTitle}</h3><p>{operational ? "Core connections and job checks are healthy." : "Review connections, jobs, and dependencies."}</p></div>
                </div>
                <div className={styles.metric}><DiscordLogo size={25} aria-hidden="true"/><div><span>Discord</span><strong data-tone={data.discordStatus === "CONNECTED" ? "success" : "danger"}>{healthLabel(data.discordStatus)}</strong></div></div>
                <div className={styles.metric}><Lightning size={25} aria-hidden="true"/><div><span>Gateway latency</span><strong>{data.gatewayLatencyMs < 0 ? "Unavailable" : `${data.gatewayLatencyMs} ms`}</strong></div></div>
                <div className={styles.metric}><Database size={25} aria-hidden="true"/><div><span>Database</span><strong data-tone={data.databaseStatus === "available" ? "success" : "danger"}>{healthLabel(data.databaseStatus)}</strong></div></div>
                <div className={styles.metric}><Clock size={25} aria-hidden="true"/><div><span>Uptime</span><strong>{data.startedAt ? healthUptime(data.uptimeSeconds) : "Unavailable"}</strong></div></div>
                <div className={`${styles.metric} ${styles.versions}`}><Package size={25} aria-hidden="true"/><dl><div><dt>Backend version</dt><dd>{data.backendVersion}</dd></div><div><dt>Frontend version</dt><dd>{frontendVersion}</dd></div></dl></div>
            </section>
            <div className={styles.grid}>
                <section className={`${styles.panel} ${styles.jobs}`} aria-labelledby="health-jobs-title">
                    <div className={styles.sectionHeading}><div><h3 id="health-jobs-title">Background jobs</h3><p>Scheduled work and its latest result.</p></div>
                        <div className={styles.jobControls}><label className={styles.search}><MagnifyingGlass size={19} aria-hidden="true"/><span className={styles.srOnly}>Search jobs</span><input type="search" placeholder="Search jobs…" value={query} onChange={event => setQuery(event.target.value)}/></label>
                            <div className={styles.filters} aria-label="Job filter"><button type="button" aria-pressed={!attentionOnly} onClick={() => setAttentionOnly(false)}>All ({data.jobs.length})</button><button type="button" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(true)}>Needs attention ({attentionCount})</button></div>
                        </div>
                    </div>
                    <div className={styles.tableWrap}><table><caption className={styles.srOnly}>Background jobs. All timestamps are UTC. Expand a job for its execution details.</caption>
                        <thead><tr><th scope="col">Job</th><th scope="col">Status</th><th scope="col">Last success (UTC)</th><th scope="col">Next run (UTC)</th><th scope="col">Details</th></tr></thead>
                        <tbody>{rows.map(job => <Fragment key={job.name}>
                            <tr className={expanded.has(job.name) ? styles.expandedRow : undefined}>
                                <th scope="row"><span className={styles.jobName}>{job.name}</span><small>{jobDescriptions[job.name] ?? "Scheduled background work."}</small></th>
                                <td><JobStatus job={job}/></td><td><Timestamp value={job.lastSuccess}/></td><td><Timestamp value={job.nextRun}/></td>
                                <td><button type="button" className={styles.detailButton} aria-label={`${expanded.has(job.name) ? "Hide" : "Show"} details for ${job.name}`} aria-expanded={expanded.has(job.name)} aria-controls={`health-job-${job.name}`} onClick={() => toggleJob(job.name)}>{expanded.has(job.name) ? <CaretDown size={19} aria-hidden="true"/> : <CaretRight size={19} aria-hidden="true"/>}</button></td>
                            </tr>
                            <tr hidden={!expanded.has(job.name)} id={`health-job-${job.name}`} className={styles.detailRow}><td colSpan={5}>
                                <dl className={styles.jobFacts}><div><dt>Started</dt><dd><Timestamp value={job.started}/></dd></div><div><dt>Last completed</dt><dd><Timestamp value={job.completed}/></dd></div><div><dt>Last success</dt><dd><Timestamp value={job.lastSuccess}/></dd></div><div><dt>Next run</dt><dd><Timestamp value={job.nextRun}/></dd></div></dl>
                                {job.disabledReason ? <p className={styles.reason}><Info size={18} aria-hidden="true"/><span><strong>Disabled:</strong> {job.disabledReason}</span></p> : null}
                                {job.failureReference ? <p className={styles.reason}><WarningCircle size={18} aria-hidden="true"/><span><strong>Failure reference:</strong> <code>{job.failureReference}</code></span></p> : null}
                                {job.overdue ? <p className={styles.reason}>An expected successful execution is overdue.</p> : null}
                            </td></tr>
                        </Fragment>)}</tbody>
                    </table></div>
                    {rows.length === 0 ? <p className={styles.empty} role="status">{query ? "No jobs match this search." : attentionOnly ? "No jobs need attention." : "No background jobs are registered."}</p> : null}
                    <p className={styles.footnote}><Info size={17} aria-hidden="true"/>Job state resets when the bot restarts. Disabled jobs are shown separately from failures.</p>
                </section>
                <aside className={`${styles.panel} ${styles.dependencies}`} aria-labelledby="health-dependencies-title">
                    <h3 id="health-dependencies-title">Dependencies</h3><p>Configured Discord resources and required permissions.</p>
                    <div className={styles.dependencySummary} data-tone={problems.length ? "warning" : "success"}>
                        {problems.length ? <WarningCircle size={27} aria-hidden="true"/> : <CheckCircle size={27} weight="fill" aria-hidden="true"/>}
                        <div><strong>{problems.length ? `${problems.length} ${problems.length === 1 ? "resource needs" : "resources need"} attention` : "All checked resources available"}</strong><p>{data.dependencies.length} resources checked in this snapshot.</p></div>
                    </div>
                    <dl className={styles.dependencyGroups}>
                        <div><Hash size={23} aria-hidden="true"/><dt>Channels & categories</dt><dd>{data.dependencies.filter(resource => resource.kind === "channel").length} checked</dd></div>
                        <div><Users size={23} aria-hidden="true"/><dt>Roles</dt><dd>{data.dependencies.filter(resource => resource.kind === "role").length} checked</dd></div>
                        <div><ShieldCheck size={23} aria-hidden="true"/><dt>Permissions</dt><dd>{problems.length ? "Review issues below" : "Required checks passed"}</dd></div>
                    </dl>
                    {problems.length ? <ul className={styles.problems}>{problems.map(resource => <li key={resource.name}><strong>{resource.name}</strong>{resource.problems.map(problem => <p key={problem}>{problem}</p>)}</li>)}</ul> : null}
                    <details className={styles.resourceDetails}><summary>View all resource checks</summary><ul>{data.dependencies.map(resource => <li key={resource.name}><strong>{resource.name}</strong><code>{resource.id || "Connection"}</code><span>{resource.problems.length ? resource.problems.join(" · ") : "Available"}</span></li>)}</ul></details>
                    <p className={styles.footnote}>Checks cover configured resources; they do not test every external service.</p>
                </aside>
            </div>
        </>}
    </main>;
}

export default function AdminHealth({loaded, loggedIn, adminUser, token, frontendVersion}: Props) {
    const allowed = loaded && loggedIn && canViewHealth(adminUser);
    const [retry, setRetry] = useState(0);
    const [result, setResult] = useState<{session: string | null; data?: BotHealth; error?: string; pending: boolean}>({session: null, pending: true});
    useEffect(() => {
        if (!allowed || !token) return;
        const controller = new AbortController();
        setResult(current => ({session: token, data: current.session === token ? current.data : undefined, pending: true}));
        const timeout = setTimeout(() => controller.abort(new Error("The health request timed out. Please try again.")), 15000);
        let active = true;
        void ApiUtils.getHealth(controller.signal).then(data => {
            if (active) setResult({session: token, data, pending: false});
        }).catch(reason => {
            if (active) setResult(current => ({session: token, data: current.session === token ? current.data : undefined,
                error: reason instanceof Error ? reason.message : "Health is currently unavailable.", pending: false}));
        }).finally(() => clearTimeout(timeout));
        return () => { active = false; clearTimeout(timeout); controller.abort(); };
    }, [allowed, token, retry]);
    if (!loaded) return <AdminLoadingScreen/>;
    if (!loggedIn) return <AdminLoginScreen/>;
    if (!canViewHealth(adminUser)) return <AdminErrorScreen header="Admin access required" content="System health is available to application admins and the super admin."/>;
    const current = result.session === token ? result : {pending: true, data: undefined, error: undefined};
    return <HealthContent data={current.data} frontendVersion={frontendVersion} refreshing={current.pending} error={current.error} refresh={() => setRetry(value => value + 1)}/>;
}
