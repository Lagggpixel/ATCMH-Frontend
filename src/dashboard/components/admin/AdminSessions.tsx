import type {Session} from "../../types/Session.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useSearchParams, useNavigate} from "../../next-navigation";
import {useBrowserPreference} from "../../hooks/useBrowserPreference";
import {defaultSessionPreferences, defaultSessionFilters, parseSessionPreferences} from "../../utils/SessionPreferences";
import {downloadSessionCalendar} from "../../utils/SessionTime";
import SessionTimeDisplay from "./SessionTimeDisplay";
import {formatAdminUtcDate} from "../../utils/AdminDateUtils.ts";
import {availableUserName, formatUserName, matchesUserSearch} from "../../../lib/user-display-name.ts";
import styles from "./AdminSessions.module.css"
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import {useTableSort} from "../../hooks/useTableSort.ts";
import {usePagination} from "../../hooks/usePagination.ts";
import AdminPagination from "./AdminPagination.tsx";

interface AdminSessionStatsProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    sessions: Session[] | undefined;
    users: AtcmhUser[] | undefined;
    adminUser?: AdminUser;
    accountId?: string;
}

const AdminSessions = ({
                           loaded,
                           loggedIn,
                       error,
                       sessions,
                       users,
                       adminUser,
                       accountId,
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
    const [filtersOpen, setFiltersOpen] = useState(false);

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

    const getAttendeeNames = useCallback((attendeeIds: string[]) => {
        return attendeeIds.map(id => ({
            id,
            name: formatUserName(id, usersById.get(id)?.username, `ID ${id}`),
            hasUsername: Boolean(availableUserName(usersById.get(id)?.username))
        }));
    }, [usersById]);

    const displayedSessions = useMemo(() => {
        if (!sessions || !users) return [];

        let filteredSessions = [...sessions];
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
    }, [filter, matchesSessionUser, sessions, users, selectedSessionId, adminUser?.id, now]);

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
        return sessions?.find(session => session.id === attendeesModalSessionId);
    }, [attendeesModalSessionId, sessions]);

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
            <div className={styles.adminSessionsControls}>
                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="mentor-filter">Mentor</label>
                    <input
                        id="mentor-filter"
                        type="text"
                        name="mentor"
                        placeholder="Search mentors..."
                        value={filter.mentor}
                        onChange={handleFilterChange}
                    />
                </div>

                <button type="button" className={styles.mobileFiltersToggle} aria-controls="session-extra-filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)}>{filtersOpen ? "Hide filters" : "Filters"}</button>

                <div id="session-extra-filters" className={styles.secondaryFilters} data-open={filtersOpen}>

                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="mentee-filter">Mentee</label>
                    <input
                        id="mentee-filter"
                        type="text"
                        name="mentee"
                        placeholder="Search mentees..."
                        value={filter.mentee}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="attendee-filter">Attendee</label>
                    <input
                        id="attendee-filter"
                        type="text"
                        name="attendee"
                        placeholder="Search attendees or IDs..."
                        value={filter.attendee}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="cancelled-filter">Status</label>
                    <select
                        id="cancelled-filter"
                        name="cancelled"
                        value={filter.cancelled}
                        onChange={handleFilterChange}
                    >
                        <option value="all">All Sessions</option>
                        <option value="active">Not cancelled</option>
                        <option value="cancelled">Cancelled Only</option>
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
                </div>
            </div>
            {filter.from && filter.to && filter.from > filter.to ? <p role="alert">The end date must be on or after the start date.</p> : null}
            <div className={styles.adminSessionsSessionsCount} role="status">
                Showing {displayedSessions.length} session{displayedSessions.length !== 1 ? 's' : ''}
            </div>
            <div className={styles.adminSessionsSessionsTable}>
                <table className={styles.adminSessionsDataTable}>
                    <thead>
                    <tr>
                        <th scope="col" aria-sort={sortState.column==="time" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("time")}>
                                Time <span className={`${styles.sortIndicator} ${sortState.column==="time" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="time" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                            </button>
                        </th>
                        <th scope="col" aria-sort={sortState.column==="mentor" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("mentor")}>
                                Mentor <span className={`${styles.sortIndicator} ${sortState.column==="mentor" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="mentor" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                            </button>
                        </th>
                        <th scope="col" aria-sort={sortState.column==="mentee" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("mentee")}>
                                Mentee <span className={`${styles.sortIndicator} ${sortState.column==="mentee" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="mentee" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                            </button>
                        </th>
                        <th scope="col" aria-sort={sortState.column==="airport" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("airport")}>
                                Airport <span className={`${styles.sortIndicator} ${sortState.column==="airport" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="airport" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                            </button>
                        </th>
                        <th scope="col" aria-sort={sortState.column==="pilots" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("pilots")}>
                                Pilot <span className={`${styles.sortIndicator} ${sortState.column==="pilots" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="pilots" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                            </button>
                        </th>
                        <th scope="col" aria-sort={sortState.column==="cancelled" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            <button type="button" className={styles.sortButton} onClick={() => handleSort("cancelled")}>
                                Status <span className={`${styles.sortIndicator} ${sortState.column==="cancelled" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="cancelled" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                            </button>
                        </th>
                        <th scope="col">Attendees</th>
                        <th scope="col">View</th>
                    </tr>
                    </thead>
                    <tbody>
                    {pagination.paginatedItems.length > 0 ? pagination.paginatedItems.map((record) => {
                        const session = displayedSessions.find(s => s.id === record.id);
                        if (!session) return null;
                        return (
                        <tr key={session.id} className={session.cancelled ? styles.cancelled : undefined}>
                            <td className={styles.adminSessionTimeCell} data-label="Time"><SessionTimeDisplay value={session.time}/><button type="button" className={styles.calendarButton} onClick={() => downloadSessionCalendar(session, {mentor: record.mentor, mentee: record.mentee})} aria-label={`Add session ${session.id} to calendar`}>Add to calendar</button></td>
                            <td data-label="Mentor">{record.mentor}</td>
                            <td data-label="Mentee">{record.mentee}</td>
                            <td data-label="Airport">{record.airport}</td>
                            <td data-label="Pilot">{record.pilots}</td>
                            <td data-label="Status">
                                {record.cancelled ? (
                                    <span className={styles.adminCancelledBadge}>Cancelled</span>
                                ) : (
                                    <span className={styles.adminActiveBadge}>{new Date(session.time).getTime() >= now ? "Upcoming" : "Past"}</span>
                                )}
                            </td>
                            <td data-label="Attendees">
                                {record.attendees}
                            </td>
                            <td data-label="View">
                                {session.attendees.length > 0 ? (
                                    <button
                                        type="button"
                                        className={styles.adminAttendeesViewButton}
                                        onClick={() => setAttendeesModalSessionId(session.id)}
                                    >
                                        View
                                    </button>
                                ) : (
                                    <span className={styles.adminAttendeesUnavailable}>-</span>
                                )}
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
                className={styles.adminSessionsFlushPagination}
            />
            {attendeesModalSession ? (
                <div className={styles.adminAttendeesModalOverlay} role="presentation">
                    <div
                        className={styles.adminAttendeesModal}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="attendees-modal-title"
                    >
                        <div className={styles.adminAttendeesModalHeader}>
                            <div>
                                <h2 id="attendees-modal-title">Session Attendees</h2>
                                <p>
                                    {formatAdminUtcDate(attendeesModalSession.time)} - {attendeesModalSession.airport}
                                </p>
                            </div>
                            <button
                                type="button"
                                className={styles.adminAttendeesCloseButton}
                                onClick={() => setAttendeesModalSessionId(null)}
                                aria-label="Close attendees popup"
                            >
                                Close
                            </button>
                        </div>
                        <div className={styles.adminAttendeesDetails}>
                            {getAttendeeNames(attendeesModalSession.attendees).map((attendee, index) => (
                                <div key={`${attendee.id}-${index}`} className={styles.adminAttendeeDetailItem}>
                                    <span className={styles.adminAttendeeName}>{attendee.name}</span>
                                    {!attendee.hasUsername ? (
                                        <span className={styles.adminAttendeeId}>Discord username unavailable</span>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default AdminSessions;
