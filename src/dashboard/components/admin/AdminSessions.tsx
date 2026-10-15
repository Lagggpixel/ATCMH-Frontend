import type {Session} from "../../types/Session.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useSearchParams, useNavigate} from "../../next-navigation";
import {useBrowserPreference} from "../../hooks/useBrowserPreference";
import {defaultSessionPreferences, defaultSessionFilters, parseSessionPreferences} from "../../utils/SessionPreferences";
import SessionTimeDisplay from "./SessionTimeDisplay";
import {formatUserName, matchesUserSearch} from "../../../lib/user-display-name.ts";
import styles from "./AdminSessions.module.css"
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import {useTableSort} from "../../hooks/useTableSort.ts";
import {usePagination} from "../../hooks/usePagination.ts";
import AdminPagination from "./AdminPagination.tsx";
import SessionViewDialog from "./SessionViewDialog";
import {ApiUtils} from "../../utils/ApiUtils";
import type {AdminMentee} from "../../types/AdminMentee";
import {CaretDown, CaretUp, MagnifyingGlass, SlidersHorizontal} from "@phosphor-icons/react";

interface AdminSessionStatsProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    sessions: Session[] | undefined;
    users: AtcmhUser[] | undefined;
    adminUser?: AdminUser;
    accountId?: string;
    token?: string | null;
    mentees?: AdminMentee[];
    onSessionChanged?: (menteeRecordId: number, session: Session) => void;
}

const AdminSessions = ({
                           loaded,
                           loggedIn,
                       error,
                       sessions,
                       users,
                       adminUser,
                       accountId,
                       token,
                       mentees,
                       onSessionChanged,
                   }: AdminSessionStatsProps) => {
    const preferenceOwner = accountId ?? adminUser?.id;
    const [preferences, setPreferences] = useBrowserPreference(
        loggedIn && preferenceOwner ? `atcmh:sessions:v1:${preferenceOwner}` : null,
        defaultSessionPreferences, parseSessionPreferences,
    );
    const filter = preferences.filter;
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const selectedSessionId = searchParams.get("session");
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer);}, []);
    const [attendeesModalSessionId, setAttendeesModalSessionId] = useState<number | null>(null);
    const [outcomes, setOutcomes] = useState<Record<number, Session>>({});
    const [filtersOpen, setFiltersOpen] = useState(false);
    const activeFilterCount = Object.entries(filter).filter(([key, value]) => value !== defaultSessionFilters[key as keyof typeof defaultSessionFilters]).length;

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const {name, value} = e.target;
        setPreferences(prev => ({...prev, filter: {...prev.filter, [name]: value}}));
        pagination.reset();
    };

    const usersById = useMemo(() => new Map(users?.map(user => [user.id, user]) ?? []), [users]);

    const getUserName = useCallback((id: string) =>
        formatUserName(id, usersById.get(id)?.username), [usersById]);

    const matchesSessionUser = useCallback((id: string, query: string) =>
        matchesUserSearch(id, usersById.get(id)?.username, query), [usersById]);

    const displayedSessions = useMemo(() => {
        if (!sessions || !users) return [];

        let filteredSessions = sessions.map(session => outcomes[session.id] ?? session);
        if (selectedSessionId) return filteredSessions.filter(session => String(session.id) === selectedSessionId);

        if (filter.mine) filteredSessions = filteredSessions.filter(session => session.mentor === adminUser?.id);
        if (filter.period !== "all") filteredSessions = filteredSessions.filter(session =>
            filter.period === "upcoming" ? new Date(session.time).getTime() >= now : new Date(session.time).getTime() < now);
        if (filter.from) filteredSessions = filteredSessions.filter(session => new Date(session.time).getTime() >= Date.parse(`${filter.from}T00:00:00Z`));
        if (filter.to) filteredSessions = filteredSessions.filter(session => new Date(session.time).getTime() < Date.parse(`${filter.to}T00:00:00Z`) + 86_400_000);

        if (filter.mentor) {
            filteredSessions = filteredSessions.filter(session => matchesSessionUser(session.mentor, filter.mentor));
        }

        if (filter.mentee) {
            filteredSessions = filteredSessions.filter(session => matchesSessionUser(session.mentee, filter.mentee));
        }

        if (filter.attendee) {
            filteredSessions = filteredSessions.filter(session =>
                session.attendees.some(attendeeId => matchesSessionUser(attendeeId, filter.attendee))
            );
        }

        if (filter.cancelled !== "all") {
            const cancelledFilter = filter.cancelled === "cancelled";
            filteredSessions = filteredSessions.filter(session => session.cancelled === cancelledFilter);
        }

        filteredSessions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        return filteredSessions;
    }, [filter, matchesSessionUser, sessions, users, selectedSessionId, adminUser?.id, now, outcomes]);

    const sessionRecords = useMemo(() => displayedSessions.map(session => ({
        time: session.time,
        mentor: getUserName(session.mentor),
        mentee: getUserName(session.mentee),
        airport: session.airport,
        pilots: String(session.pilots),
        cancelled: session.cancelled,
        attendees: session.attendees.length,
        id: session.id,
    })), [displayedSessions, getUserName]);

    const {sortState, sortedData, handleSort} = useTableSort(
        "time",
        "desc",
        sessionRecords,
        {state: preferences.sort, onChange: sort => {setPreferences(prev => ({...prev, sort})); pagination.reset();}},
    );

    const pagination = usePagination(sortedData, preferences.pageSize);
    const handlePageSizeChange = (newPerPage: number) => {
        setPreferences(prev => ({...prev, pageSize: newPerPage}));
        pagination.reset();
    };

    const attendeesModalSession = useMemo(() => {
        return attendeesModalSessionId ? outcomes[attendeesModalSessionId] ?? sessions?.find(session => session.id === attendeesModalSessionId) : undefined;
    }, [attendeesModalSessionId, sessions, outcomes]);

    // Match the session's mentorship attempt, rather than guessing from a Discord user ID.
    const sessionMentee = attendeesModalSession ? mentees?.filter(mentee =>
        mentee.mentee === attendeesModalSession.mentee && mentee.sessions.some(session => session.id === attendeesModalSession.id)) : [];
    const menteeRecordId = sessionMentee?.length === 1 ? sessionMentee[0].id : undefined;
    const handleSessionChanged = (session: Session) => {
        setOutcomes(previous => ({...previous, [session.id]: session}));
        if (menteeRecordId !== undefined) onSessionChanged?.(menteeRecordId, session);
    };

    if (!loggedIn) {
        return <AdminLoginScreen/>
    }

    if (!loaded) {
        return <AdminLoadingScreen/>;
    }

    if (error) {
        return <AdminErrorScreen content={error}></AdminErrorScreen>;
    }

    if (!sessions || !users) {
        return <AdminUnauthorizedScreen/>;
    }

    return (
        <div className={styles.adminSessionsContainer}>
            {selectedSessionId ? <p role="status">Showing session #{selectedSessionId}. <button type="button" onClick={() => {navigate("/dashboard/sessions", {replace: true}); pagination.reset();}}>Return to saved filters</button></p> : null}
            <div className={styles.sessionsLayout}>
            <aside className={styles.adminSessionsControls} aria-label="Session filters">
                <div className={styles.filtersHeading}>
                    <h2>Filters</h2>
                    <button type="button" className={styles.mobileFiltersToggle} aria-controls="session-extra-filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)}>
                        <SlidersHorizontal size={18} aria-hidden="true"/> {filtersOpen ? "Hide filters" : "Show filters"}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                    </button>
                </div>
                <div id="session-extra-filters" className={styles.secondaryFilters} data-open={filtersOpen}>
                <fieldset disabled={Boolean(selectedSessionId)} className={styles.filtersFields}>
                <legend className={styles.srOnly}>Filter sessions</legend>
                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="mentor-filter">Mentor</label>
                    <div className={styles.searchInput}>
                    <MagnifyingGlass size={18} aria-hidden="true"/>
                    <input
                        id="mentor-filter"
                        type="text"
                        name="mentor"
                        placeholder="Search mentors..."
                        value={filter.mentor}
                        onChange={handleFilterChange}
                    />
                    </div>
                </div>

                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="mentee-filter">Mentee</label>
                    <div className={styles.searchInput}>
                    <MagnifyingGlass size={18} aria-hidden="true"/>
                    <input
                        id="mentee-filter"
                        type="text"
                        name="mentee"
                        placeholder="Search mentees..."
                        value={filter.mentee}
                        onChange={handleFilterChange}
                    />
                    </div>
                </div>

                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="attendee-filter">Attendee</label>
                    <div className={styles.searchInput}>
                    <MagnifyingGlass size={18} aria-hidden="true"/>
                    <input
                        id="attendee-filter"
                        type="text"
                        name="attendee"
                        placeholder="Search attendees or IDs..."
                        value={filter.attendee}
                        onChange={handleFilterChange}
                    />
                    </div>
                </div>

                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="cancelled-filter">Status</label>
                    <select
                        id="cancelled-filter"
                        name="cancelled"
                        value={filter.cancelled}
                        onChange={handleFilterChange}
                    >
                        <option value="all">All sessions</option>
                        <option value="active">Not cancelled</option>
                        <option value="cancelled">Cancelled only</option>
                    </select>
                </div>
                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="session-period">When</label>
                    <select id="session-period" name="period" value={filter.period} onChange={handleFilterChange}>
                        <option value="all">All dates</option><option value="upcoming">Upcoming</option><option value="past">Past</option>
                    </select>
                </div>
                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="session-from">From (UTC)</label>
                    <input id="session-from" type="date" name="from" value={filter.from} onChange={handleFilterChange}/>
                </div>
                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="session-to">Through (UTC)</label>
                    <input id="session-to" type="date" name="to" min={filter.from || undefined} value={filter.to} onChange={handleFilterChange}/>
                </div>
                <div className={styles.filterActions}>
                    <label><input type="checkbox" checked={filter.mine} disabled={!adminUser?.id} onChange={event => {setPreferences(prev => ({...prev, filter: {...prev.filter, mine: event.target.checked}})); pagination.reset();}}/> My sessions</label>
                    <button type="button" onClick={() => {setPreferences(prev => ({...prev, filter: defaultSessionFilters})); pagination.reset();}}>Clear filters</button>
                </div>
                </fieldset>
                </div>
            </aside>
            <section className={styles.sessionsResults} aria-label="Sessions">
            {filter.from && filter.to && filter.from > filter.to ? <p role="alert">The end date must be on or after the start date.</p> : null}
            <div className={styles.adminSessionsSessionsCount} role="status">
                {displayedSessions.length.toLocaleString()} session{displayedSessions.length !== 1 ? 's' : ''} found
            </div>
            <div className={styles.adminSessionsSessionsTable}>
                <table className={styles.adminSessionsDataTable}>
                    <caption className={styles.srOnly}>Mentorship sessions. Sort using the column headings or open a session to view details.</caption>
                    <thead>
                    <tr>
                        <th scope="col" aria-sort={sortState.column==="time" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("time")}>
                                Date &amp; time <span className={`${styles.sortIndicator} ${sortState.column==="time" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="time" && sortState.direction==="desc" ? <CaretDown size={12} weight="fill"/> : <CaretUp size={12} weight="fill"/>}</span>
                            </button>
                        </th>
                        <th scope="col" aria-sort={sortState.column==="mentor" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("mentor")}>
                                Mentor <span className={`${styles.sortIndicator} ${sortState.column==="mentor" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="mentor" && sortState.direction==="desc" ? <CaretDown size={12} weight="fill"/> : <CaretUp size={12} weight="fill"/>}</span>
                            </button>
                        </th>
                        <th scope="col" aria-sort={sortState.column==="mentee" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("mentee")}>
                                Mentee <span className={`${styles.sortIndicator} ${sortState.column==="mentee" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="mentee" && sortState.direction==="desc" ? <CaretDown size={12} weight="fill"/> : <CaretUp size={12} weight="fill"/>}</span>
                            </button>
                        </th>
                        <th scope="col" aria-sort={sortState.column==="airport" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("airport")}>
                                Airport <span className={`${styles.sortIndicator} ${sortState.column==="airport" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="airport" && sortState.direction==="desc" ? <CaretDown size={12} weight="fill"/> : <CaretUp size={12} weight="fill"/>}</span>
                            </button>
                        </th>
                        <th scope="col" aria-sort={sortState.column==="pilots" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("pilots")}>
                                Pilots <span className={`${styles.sortIndicator} ${sortState.column==="pilots" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="pilots" && sortState.direction==="desc" ? <CaretDown size={12} weight="fill"/> : <CaretUp size={12} weight="fill"/>}</span>
                            </button>
                        </th>
                        <th scope="col" aria-sort={sortState.column==="cancelled" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("cancelled")}>
                                Status <span className={`${styles.sortIndicator} ${sortState.column==="cancelled" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="cancelled" && sortState.direction==="desc" ? <CaretDown size={12} weight="fill"/> : <CaretUp size={12} weight="fill"/>}</span>
                            </button>
                        </th>
                        <th scope="col">Attendees</th>
                        <th scope="col">Details</th>
                    </tr>
                    </thead>
                    <tbody>
                    {pagination.paginatedItems.length > 0 ? pagination.paginatedItems.map((record) => {
                        const session = displayedSessions.find(s => s.id === record.id);
                        if (!session) return null;
                        return (
                        <tr key={session.id}>
                            <td className={styles.adminSessionTimeCell} data-label="Date & time"><SessionTimeDisplay value={session.time}/></td>
                            <td data-label="Mentor">{record.mentor}</td>
                            <td data-label="Mentee">{record.mentee}</td>
                            <td data-label="Airport">{record.airport}</td>
                            <td data-label="Pilots">{record.pilots}</td>
                            <td data-label="Status">
                                {record.cancelled ? (
                                    <span><span className={styles.adminCancelledBadge}>{session.retainAttendance ? "Not held" : "Cancelled"}</span>{session.retainAttendance ? <small className={styles.statusNote}>Attendance retained</small> : null}</span>
                                ) : (
                                    <span className={new Date(session.time).getTime() >= now ? styles.adminUpcomingBadge : styles.adminActiveBadge}>{new Date(session.time).getTime() >= now ? "Upcoming" : "Past"}</span>
                                )}
                            </td>
                            <td data-label="Attendees">
                                {record.attendees}
                            </td>
                            <td data-label="Details">
                                    <button
                                        type="button"
                                        className={styles.adminAttendeesViewButton}
                                        aria-label={`View details for session ${session.id}`}
                                        onClick={() => setAttendeesModalSessionId(session.id)}
                                    >
                                        View details
                                    </button>
                            </td>
                        </tr>
                    );}).filter(Boolean) : (
                        <tr>
                            <td className={styles.adminSessionsNoResults} colSpan={8}>
                                No sessions match your filter criteria.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
            <AdminPagination
                {...pagination}
                totalItems={sortedData.length}
                onItemsPerPageChange={handlePageSizeChange}
                className={styles.sessionsPagination}
            />
            </section>
            </div>
            {attendeesModalSession ? <SessionViewDialog
                key={attendeesModalSession.id} session={attendeesModalSession} getUserName={getUserName}
                canGenerate={adminUser?.role === "super_admin"} token={token}
                onClose={() => setAttendeesModalSessionId(null)} onSessionChanged={handleSessionChanged}
                onCancelSession={menteeRecordId !== undefined ? () => ApiUtils.cancelMenteeSession(token ?? null, menteeRecordId, attendeesModalSession.id) : undefined}
            /> : null}
        </div>
    );
}

export default AdminSessions;
