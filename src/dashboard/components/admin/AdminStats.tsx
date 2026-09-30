import {useEffect, useMemo, useState, type FormEvent} from "react";
import Link from "next/link";
import {Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import type {AtcmhUser} from "../../types/AtcmhUser";
import type {AdminUser} from "../../types/AdminUser";
import type {ExamStatisticsReport, MentorWorkload, ProgrammeReport, StatisticsAttention} from "../../types/ProgrammeStatistics";
import {comparisonText, fetchStatistics, statisticsQuery, windowDescription, type StatisticsRange} from "../../utils/StatisticsUtils";
import {ApiUtils} from "../../utils/ApiUtils";
import {formatUserName} from "../../../lib/user-display-name";
import AdminLoginScreen from "./AdminLoginScreen";
import AdminLoadingScreen from "./AdminLoadingScreen";
import AdminErrorScreen from "./AdminErrorScreen";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen";
import styles from "./AdminStats.module.css";

interface AdminStatsProps {
    loaded: boolean; loggedIn: boolean; error?: string;
    token: string | null; adminUser?: AdminUser; users?: AtcmhUser[];
}
const number = (value: number | null | undefined, suffix = "") => value == null ? "—" : `${value.toLocaleString(undefined, {maximumFractionDigits: suffix ? 1 : 0})}${suffix}`;
const utcDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", {timeZone: "UTC", dateStyle: "medium"}).format(new Date(value)) : "—";
const shortDate = (value: string) => new Intl.DateTimeFormat("en-GB", {timeZone: "UTC", day: "numeric", month: "short"}).format(new Date(value));
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const tooltipStyle = {background: "var(--surface-color)", borderColor: "var(--border-color)", color: "var(--text-color)"};

function useReport<T>(url: string, session: string | null, retry: number, enabled: boolean) {
    const key = `${url}|${session}|${retry}`;
    const [state, setState] = useState<{key: string; data?: T; error?: string}>({key: ""});
    useEffect(() => {
        if (!enabled) return;
        const abort = new AbortController();
        void fetchStatistics<T>(url, abort.signal).then(data => {
            if (!abort.signal.aborted) setState({key, data});
        }).catch(reason => {
            if (!abort.signal.aborted) setState({key, error: reason instanceof Error ? reason.message : "Reporting unavailable."});
        });
        return () => abort.abort();
    }, [url, key, enabled]);
    return state.key === key && enabled ? state : {key};
}
function MetricCard({label, value, detail, comparison}: {label: string; value: string; detail: string; comparison?: string}) {
    return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{detail}</small>{comparison ? <small className={styles.comparison}>{comparison}</small> : null}</article>;
}
function SectionError({message, retry}: {message: string; retry: () => void}) {
    return <div className={styles.error} role="alert"><p>{message}</p><button type="button" onClick={retry}>Try again</button></div>;
}
function attentionReason(item: StatisticsAttention) {
    if (item.kind === "waitlist") return `Waiting ${number(item.days, " days")}`;
    if (item.kind === "session_inactivity") return "No recorded completed session in 30 days; none scheduled";
    return `${item.title}: last course access ${number(item.days, " days")} ago`;
}
type MentorSort = "completedSessions" | "practicalMentees" | "cancelledSessions" | "lastSessionAt" | "name";
function MentorTable({mentors, name}: {mentors: MentorWorkload[]; name: (id: string) => string}) {
    const [sort, setSort] = useState<MentorSort>("completedSessions");
    const [ascending, setAscending] = useState(false);
    const rows = useMemo(() => [...mentors].sort((a, b) => {
        const comparison = sort === "name" ? name(a.mentorId).localeCompare(name(b.mentorId))
            : sort === "lastSessionAt" ? (a.lastSessionAt ? Date.parse(a.lastSessionAt) : 0) - (b.lastSessionAt ? Date.parse(b.lastSessionAt) : 0)
            : a[sort] - b[sort];
        return (ascending ? comparison : -comparison) || a.mentorId.localeCompare(b.mentorId);
    }), [mentors, name, sort, ascending]);
    const headers: Array<[MentorSort, string]> = [["name", "Mentor"], ["practicalMentees", "Mentees · Now"],
        ["completedSessions", "Completed · Period"], ["cancelledSessions", "Cancelled · Period"], ["lastSessionAt", "Last completed · All time"]];
    const select = (next: MentorSort) => { setSort(next); setAscending(next === sort ? !ascending : next === "name"); };
    return rows.length ? <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Mentor workload table"><table><caption>Assignments count current mentee engagements. Session figures use the selected period. Dates are UTC.</caption>
        <thead><tr>{headers.map(([key, title]) => <th key={key} scope="col" aria-sort={key === sort ? ascending ? "ascending" : "descending" : "none"}>
            <button type="button" onClick={() => select(key)}>{title}{key === sort ? ascending ? " ↑" : " ↓" : ""}</button></th>)}</tr></thead>
        <tbody>{rows.map(mentor => <tr key={mentor.mentorId}><th scope="row">{name(mentor.mentorId)}</th><td>{mentor.practicalMentees}</td>
            <td>{mentor.completedSessions}</td><td>{mentor.cancelledSessions}</td><td>{utcDate(mentor.lastSessionAt)}</td></tr>)}</tbody></table></div> : <p>No mentor activity or current assignments recorded.</p>;
}

function ProgrammeView({report, name, retry}: {report: ProgrammeReport; name: (id: string) => string; retry: () => void}) {
    const {snapshot, current, previous} = report;
    const compare = (value: number | null, prior: number | null | undefined, rate = false, unit = "") => report.window.from === null ? "All time · no previous-period comparison" : comparisonText(value, prior, rate, unit);
    return <>
        <p className={styles.period}>{windowDescription(report.window)}{report.window.previousFrom ? <><br/><span>Compared with {utcDate(report.window.previousFrom)} → {utcDate(report.window.from)} (equal duration).</span></> : null}</p>
        <div className={styles.metrics} aria-label="Programme summary">
            <MetricCard label="Waiting mentees" value={number(snapshot.waitingMentees)} detail="Now · current waitlist"/>
            <MetricCard label="Mentees in training" value={number(snapshot.trainingMentees)} detail="Now · picked up, not passed or terminated"/>
            <MetricCard label="Passes" value={number(current.passes)} detail="Selected period · mentee engagements" comparison={compare(current.passes, previous?.passes)}/>
            <MetricCard label="Recorded completed sessions" value={number(current.completedSessions)} detail="Selected period · completion eligibility + 30m grace" comparison={compare(current.completedSessions, previous?.completedSessions)}/>
            <MetricCard label="Cancellation rate" value={number(current.cancellationRate.value, "%")} detail={`${number(current.cancelledSessions)} of ${number(current.sessionSampleSize)} eligible past sessions`} comparison={compare(current.cancellationRate.value, previous?.cancellationRate.value, true)}/>
            <MetricCard label="Pilot fill rate" value={number(current.pilotFillRate.value, "%")} detail={`${number(current.recordedAttendees)} recorded / ${number(current.requestedPlaces)} requested · ${number(current.pilotFillRate.sampleSize)} sessions`} comparison={compare(current.pilotFillRate.value, previous?.pilotFillRate.value, true)}/>
        </div>
        <div className={styles.grid}>
            <section className={styles.panel} aria-labelledby="pipeline-heading"><h3 id="pipeline-heading">Waitlist & mentee progress</h3>
                <dl className={styles.facts}>
                    <div><dt>Median current wait · Now</dt><dd>{number(snapshot.medianWaitingDays.value, " days")} <small>n={snapshot.medianWaitingDays.sampleSize}</small></dd></div>
                    <div><dt>Oldest current wait · Now</dt><dd>{number(snapshot.oldestWaitingDays, " days")}</dd></div>
                    <div><dt>Pickups · Period</dt><dd>{number(current.pickups)}<small>{compare(current.pickups, previous?.pickups)}</small></dd></div>
                    <div><dt>Terminations · Period</dt><dd>{number(current.terminations)}<small>{compare(current.terminations, previous?.terminations)}</small></dd></div>
                    <div><dt>Median wait to pickup · Period pickups</dt><dd>{number(current.medianWaitToPickupDays.value, " days")}<small>n={current.medianWaitToPickupDays.sampleSize}</small><small>{compare(current.medianWaitToPickupDays.value, previous?.medianWaitToPickupDays.value, false, " days")}</small></dd></div>
                    <div><dt>Median pickup to pass · Period passes</dt><dd>{number(current.medianPickupToPassDays.value, " days")}<small>n={current.medianPickupToPassDays.sampleSize}; completed engagements only</small><small>{compare(current.medianPickupToPassDays.value, previous?.medianPickupToPassDays.value, false, " days")}</small></dd></div>
                </dl><Link href="/dashboard/mentees">Open mentees</Link>
            </section>
            <section className={styles.panel} aria-labelledby="attention-heading"><h3 id="attention-heading">Needs attention <span className={styles.count}>{report.attention.length}</span></h3>
                <p>Current review prompts, independent of the selected period. These records do not establish why someone is inactive.</p>
                {report.attention.length ? <ul className={styles.attention}>{report.attention.map(item => <li key={`${item.kind}-${item.recordId}-${item.courseId}-${item.userId}`}>
                    <Link href={item.href}>{name(item.userId)}{item.recordId ? <small> · Record #{item.recordId}</small> : null}</Link><span>{attentionReason(item)}</span></li>)}</ul> : <p>No records meet the 30-day review criteria.</p>}
            </section>
        </div>
        <section className={styles.panel} aria-labelledby="sessions-heading"><div className={styles.sectionHeading}><div><h3 id="sessions-heading">Session delivery</h3><p>{number(current.completedSessions)} recorded completed and {number(current.cancelledSessions)} cancelled in the period. {number(snapshot.upcomingSessions)} upcoming now.</p></div><Link href="/dashboard/sessions">Open sessions</Link></div>
            <p className={styles.note}>Completed means eligible, not cancelled, and at least 30 minutes past its scheduled start. Historical records count when marked eligible; mentor selection sessions do not. Cancellation reasons are not inferred.</p>
            {report.weekly.length ? <div className={styles.chart} role="img" aria-label="Weekly completed and cancelled sessions. Exact values follow in the data table."><ResponsiveContainer width="100%" height="100%"><BarChart data={report.weekly} accessibilityLayer>
                <CartesianGrid stroke="var(--border-color)" vertical={false}/><XAxis dataKey="week" tickFormatter={shortDate} minTickGap={32} stroke="var(--muted-text)"/><YAxis allowDecimals={false} stroke="var(--muted-text)"/>
                <Tooltip contentStyle={tooltipStyle} labelFormatter={label => `Week of ${utcDate(String(label))} UTC`}/><Legend formatter={value => <span className={styles.legendLabel}>{value}</span>}/>
                <Bar dataKey="completed" name="Recorded completed" fill="var(--accent-color)" isAnimationActive={false}/><Bar dataKey="cancelled" name="Cancelled" fill="#b06a26" isAnimationActive={false}/>
            </BarChart></ResponsiveContainer></div> : <p>No eligible session outcomes in this period.</p>}
            <details><summary>Weekly delivery data</summary><div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Weekly delivery data"><table><caption>UTC weeks; first and last weeks may be partial.</caption><thead><tr><th scope="col">Week of</th><th scope="col">Recorded completed</th><th scope="col">Cancelled</th></tr></thead>
                <tbody>{report.weekly.map(week => <tr key={week.week}><th scope="row">{utcDate(week.week)}</th><td>{week.completed}</td><td>{week.cancelled}</td></tr>)}</tbody></table></div></details>
        </section>
        <div className={styles.grid}>
            <section className={styles.panel} aria-labelledby="fill-heading"><h3 id="fill-heading">Pilot fill trend</h3><p>Recorded attendees ÷ requested pilot places. This includes advertised cancelled sessions and can exceed 100%; it does not independently verify physical attendance.</p>
                {report.fillTrend.length ? <div className={styles.chart} role="img" aria-label="Daily pilot fill rate and weighted seven-calendar-day rate. Exact values follow in the data table."><ResponsiveContainer width="100%" height="100%"><LineChart data={report.fillTrend} accessibilityLayer>
                    <CartesianGrid stroke="var(--border-color)" vertical={false}/><XAxis dataKey="date" tickFormatter={shortDate} minTickGap={40} stroke="var(--muted-text)"/><YAxis tickFormatter={value => `${value}%`} stroke="var(--muted-text)"/>
                    <Tooltip contentStyle={tooltipStyle} formatter={value => number(value == null ? null : Number(value), "%")} labelFormatter={label => `${utcDate(String(label))} UTC`}/><Legend formatter={value => <span className={styles.legendLabel}>{value}</span>}/>
                    <Line dataKey="fillRate" name="Daily fill" stroke="#9270a7" dot={false} strokeWidth={1} isAnimationActive={false}/>
                    <Line dataKey="movingAverage" name="7 calendar days · weighted" stroke="var(--accent-color)" dot={false} strokeWidth={3} isAnimationActive={false}/>
                </LineChart></ResponsiveContainer></div> : <p>No pilot request data in this period.</p>}
                <details><summary>Pilot fill data & definition</summary><p>Past eligible sessions with a posted request and a positive pilot target. Seven-day rates sum attendees and targets over the date and six preceding calendar days; empty days contribute no requests. The moving rate includes earlier days at the range boundary.</p>
                    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Pilot fill data"><table><caption>Daily pilot requests in UTC</caption><thead><tr><th scope="col">Date</th><th scope="col">Sessions</th><th scope="col">Recorded / requested</th><th scope="col">Daily fill</th><th scope="col">7 days</th></tr></thead>
                        <tbody>{report.fillTrend.map(day => <tr key={day.date}><th scope="row">{utcDate(day.date)}</th><td>{day.sampleSize}</td><td>{day.attendees} / {day.requested}</td><td>{number(day.fillRate, "%")}</td><td>{number(day.movingAverage, "%")}</td></tr>)}</tbody></table></div>
                </details>
            </section>
            <section className={styles.panel} aria-labelledby="timing-heading"><h3 id="timing-heading">Pilot support by session time</h3><p>UTC weekday and hour · fill rate and session count. Cells with fewer than 10 sessions have limited evidence.</p>
                <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Pilot support heatmap"><table className={styles.heatmap}><caption>Each cell shows fill rate, then number of sessions. Colour repeats the displayed rate.</caption>
                    <thead><tr><th scope="col">UTC</th>{Array.from({length: 24}, (_, hour) => <th scope="col" key={hour}>{String(hour).padStart(2, "0")}</th>)}</tr></thead>
                    <tbody>{weekdays.map((day, weekday) => <tr key={day}><th scope="row">{day}</th>{report.heatmap.filter(cell => cell.weekday === weekday).map(cell => <td key={cell.hour} data-evidence={cell.sessions < 10 ? "limited" : "sufficient"}
                        style={{backgroundColor: cell.fillRate == null ? undefined : `color-mix(in srgb, var(--accent-color) ${Math.min(28, cell.fillRate * 0.24)}%, var(--surface-color))`}}
                        title={`${day} ${cell.hour}:00 UTC: ${number(cell.fillRate, "%")}, ${cell.sessions} sessions${cell.sessions < 10 ? "; limited evidence" : ""}`}>
                        {number(cell.fillRate, "%")}<small>{cell.sessions} sessions{cell.sessions < 10 ? "*" : ""}</small></td>)}</tr>)}</tbody>
                </table></div><p className={styles.note}>Scroll horizontally for all 24 hours. * Limited evidence. Review session counts before drawing conclusions about timing.</p>
            </section>
        </div>
        <section className={styles.panel} aria-labelledby="mentors-heading"><h3 id="mentors-heading">Mentor workload</h3><p>Current Discord mentors only. Sort by current assignments or recent delivery to see where work is concentrated.</p><MentorTable mentors={report.mentors} name={name}/></section>
        <section className={styles.panel} aria-labelledby="courses-heading"><div className={styles.sectionHeading}><div><h3 id="courses-heading">Course progress</h3><p>Starts and completions use the selected period. Enrolment totals, completion rates and inactivity are current snapshots.</p></div><Link href="/dashboard/courses">Open courses</Link></div>
            {report.courses.status === "unavailable" ? <SectionError message={report.courses.message ?? "Course reporting unavailable."} retry={retry}/>
                : report.courses.status === "forbidden" ? <p>Course reporting requires course management access.</p>
                : report.courses.rows.length ? <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Course progress table"><table><caption>Completion rate = currently completed enrolments / all enrolments. Inactive = in progress, last accessed more than 30 days ago. Checkpoint rules and configured pass marks are available in each course’s statistics.</caption>
                    <thead><tr>{["Course", "Starts · Period", "Completions · Period", "Enrolled · Now", "In progress · Now", "Completion · Now", "Inactive · Now"].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead>
                    <tbody>{report.courses.rows.map(course => <tr key={course.id}><th scope="row"><Link href={`/dashboard/courses/${encodeURIComponent(course.id)}/stats`}>{course.title}</Link></th>
                        <td>{course.starts}<small>{compare(course.starts, course.previousStarts)}</small></td><td>{course.completions}<small>{compare(course.completions, course.previousCompletions)}</small></td>
                        <td>{course.learnersStarted}</td><td>{course.inProgress}</td><td>{number(course.completionRate.value, "%")}<small>{course.learnersCompleted} / {course.learnersStarted}</small></td><td>{course.inactiveLearners}</td></tr>)}</tbody>
                </table></div> : <p>No courses recorded yet.</p>}
        </section>
        <p className={styles.note}>Snapshots as of {windowDescription({...report.window, from: null, to: report.window.asOf}).replace("All recorded history → ", "")}. Repeat mentee engagements count separately; unavailable ratios display “—”.</p>
    </>;
}
function ExamView({report}: {report: ExamStatisticsReport}) {
    const {current, previous} = report;
    const compare = (value: number | null, prior: number | null | undefined, rate = false) => report.window.from === null ? "All time · no previous-period comparison" : comparisonText(value, prior, rate);
    return <>
        <p className={styles.period}>{windowDescription(report.window)}</p>
        <div className={styles.examMetrics}>
            <MetricCard label="Exam attempts" value={number(current.attempts)} detail="Selected period · includes repeat attempts" comparison={compare(current.attempts, previous?.attempts)}/>
            <MetricCard label="Identified learners" value={number(current.identifiedLearners)} detail="Distinct stable identities across quizzes" comparison={compare(current.identifiedLearners, previous?.identifiedLearners)}/>
            <MetricCard label="Median score" value={number(current.medianScore, "%")} detail={`Across ${current.attempts} attempts; quiz difficulty varies`} comparison={compare(current.medianScore, previous?.medianScore, true)}/>
            <MetricCard label="Timeout rate" value={number(current.timeoutRate, "%")} detail={`${current.timedOutAttempts} of ${current.attempts} attempts`} comparison={compare(current.timeoutRate, previous?.timeoutRate, true)}/>
        </div>
        <p>{current.unidentifiedAttempts} attempts in this period could not be linked to a stable learner identity. {report.undatedAttempts} undated historical attempts are excluded from period reporting.</p>
        {report.quizzes.length ? <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Exam statistics by quiz"><table><caption>Scores describe attempts, not programme passes. Standalone quizzes have no general pass threshold.</caption>
            <thead><tr>{["Quiz", "Attempts", "Identified learners", "Unidentified attempts", "Median score", "Timeouts"].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead>
            <tbody>{report.quizzes.map(quiz => <tr key={quiz.quizId}><th scope="row"><Link href={`/dashboard/exams/attempts?query=${encodeURIComponent(quiz.title)}`}>{quiz.title}</Link></th><td>{quiz.attempts}</td><td>{quiz.identifiedLearners}</td><td>{quiz.unidentifiedAttempts}</td><td>{number(quiz.medianScore, "%")}</td><td>{number(quiz.timeoutRate, "%")}<small>{quiz.timedOutAttempts} / {quiz.attempts}</small></td></tr>)}</tbody>
        </table></div> : <p>No dated exam attempts in this period.</p>}
    </>;
}

export default function AdminStats({loaded, loggedIn, error, token, adminUser, users}: AdminStatsProps) {
    const [range, setRange] = useState<StatisticsRange>("30");
    const [start, setStart] = useState(() => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
    const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
    const [query, setQuery] = useState(() => statisticsQuery("30", new Date()).toString());
    const [rangeError, setRangeError] = useState<string>();
    const [programmeRetry, setProgrammeRetry] = useState(0);
    const [examRetry, setExamRetry] = useState(0);
    const enabled = loggedIn && !!adminUser && !!token;
    const programme = useReport<ProgrammeReport>(`${ApiUtils.apiOrigin}/admin/statistics/programme?${query}`, token, programmeRetry, enabled);
    const exams = useReport<ExamStatisticsReport>(`/exams/api/management/statistics?${query}`, token, examRetry, enabled);
    const names = useMemo(() => new Map(users?.map(user => [user.id, user.username]) ?? []), [users]);
    const name = useMemo(() => (id: string) => formatUserName(id, names.get(id)), [names]);
    const apply = (next: StatisticsRange) => {
        try { setQuery(statisticsQuery(next, new Date(), start, end).toString()); setRangeError(undefined); }
        catch (reason) { setRangeError(reason instanceof Error ? reason.message : "Invalid range."); }
    };
    const submit = (event: FormEvent) => { event.preventDefault(); apply(range); };
    if (!loggedIn) return <AdminLoginScreen/>;
    if (!adminUser && !loaded) return <AdminLoadingScreen/>;
    if (!adminUser && error) return <AdminErrorScreen content={error}/>;
    if (!adminUser) return <AdminUnauthorizedScreen/>;
    return <div className={styles.container}>
        <header className={styles.heading}><div><p className={styles.eyebrow}>Statistics</p><h2>Programme overview</h2><p>Recent progress, current bottlenecks, and records to review.</p></div>
            <form className={styles.controls} onSubmit={submit} aria-label="Reporting date range">
                <label>Activity period<select value={range} onChange={event => {const next = event.target.value as StatisticsRange; setRange(next); if (next !== "custom") apply(next);}}>
                    <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option><option value="custom">Custom range</option>
                </select></label>
                {range === "custom" ? <><label>From · UTC<input type="date" required value={start} onChange={event => setStart(event.target.value)}/></label><label>Through · UTC<input type="date" required value={end} onChange={event => setEnd(event.target.value)}/></label><button type="submit">Apply dates</button></> : null}
                <button type="button" onClick={() => {setProgrammeRetry(value => value + 1); setExamRetry(value => value + 1);}}>Refresh data</button>
            </form>
        </header>
        {rangeError ? <p role="alert" className={styles.error}>{rangeError}</p> : null}
        {programme.error ? <SectionError message={programme.error} retry={() => setProgrammeRetry(value => value + 1)}/>
            : programme.data ? <ProgrammeView report={programme.data} name={name} retry={() => setProgrammeRetry(value => value + 1)}/>
            : <p role="status">Loading programme reporting…</p>}
        <section className={styles.panel} aria-labelledby="exams-heading"><div className={styles.sectionHeading}><div><h3 id="exams-heading">Exam outcomes</h3><p>Assessment activity is loaded independently from programme reporting.</p></div><Link href="/dashboard/exams/attempts">Open exam attempts</Link></div>
            {exams.error ? <SectionError message={exams.error} retry={() => setExamRetry(value => value + 1)}/>
                : exams.data ? <ExamView report={exams.data}/> : <p role="status">Loading exam reporting…</p>}
        </section>
    </div>;
}
