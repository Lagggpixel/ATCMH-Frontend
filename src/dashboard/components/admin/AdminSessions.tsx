import type {Session} from "../../types/Session.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import {useCallback, useMemo, useState} from "react";
import {formatAdminUtcDate} from "../../utils/AdminDateUtils.ts";
import styles from "./AdminSessions.module.css"
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import AdminNav from "./AdminNav.tsx";
import type {AdminUser} from "../../types/AdminUser.ts";
import {useTableSort} from "../../hooks/useTableSort.ts";
import {usePagination} from "../../hooks/usePagination.ts";
import AdminPagination from "./AdminPagination.tsx";

interface AdminSessionStatsProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    sessions: Session[] | undefined;
    users: AtcmhUser[] | undefined;
    adminUser: AdminUser | undefined;
}

const AdminSessions = ({
                           loaded,
                           loggedIn,
                       error,
                       sessions,
                       users,
                       adminUser
                   }: AdminSessionStatsProps) => {
    const [filter, setFilter] = useState({
        mentor: "",
        mentee: "",
        attendee: "",
        cancelled: "all"
    });
    const [attendeesModalSessionId, setAttendeesModalSessionId] = useState<number | null>(null);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const {name, value} = e.target;
        setFilter(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const usersById = useMemo(() => new Map(users?.map(user => [user.id, user]) ?? []), [users]);

    const getUserName = useCallback((id: string) => {
        const user = usersById.get(id);
        return user ? user.username : `User (${id})`;
    }, [usersById]);

    const matchesUserSearch = useCallback((id: string, query: string) => {
        const normalizedQuery = query.trim().toLowerCase();
        return `${id} ${getUserName(id)}`.toLowerCase().includes(normalizedQuery);
    }, [getUserName]);

    const getAttendeeNames = useCallback((attendeeIds: string[]) => {
        return attendeeIds.map(id => ({
            id,
            name: usersById.get(id)?.username ?? `ID ${id}`,
            hasUsername: usersById.has(id)
        }));
    }, [usersById]);

    const displayedSessions = useMemo(() => {
        if (!sessions || !users) return [];

        let filteredSessions = [...sessions];

        if (filter.mentor) {
            filteredSessions = filteredSessions.filter(session => matchesUserSearch(session.mentor, filter.mentor));
        }

        if (filter.mentee) {
            filteredSessions = filteredSessions.filter(session => matchesUserSearch(session.mentee, filter.mentee));
        }

        if (filter.attendee) {
            filteredSessions = filteredSessions.filter(session =>
                session.attendees.some(attendeeId => matchesUserSearch(attendeeId, filter.attendee))
            );
        }

        if (filter.cancelled !== "all") {
            const cancelledFilter = filter.cancelled === "cancelled";
            filteredSessions = filteredSessions.filter(session => session.cancelled === cancelledFilter);
        }

        filteredSessions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        return filteredSessions;
    }, [filter, matchesUserSearch, sessions, users]);

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

    const [currentPage, setCurrentPage] = useState(25);

    const {sortState, sortedData, handleSort} = useTableSort(
        "time",
        "desc",
        sessionRecords
    );

    const pagination = usePagination(sortedData, currentPage);
    const handlePageSizeChange = (newPerPage: number) => {
        setCurrentPage(newPerPage);
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
            <AdminNav adminUser={adminUser}/>
            <h1>Sessions List</h1>

            <div className={styles.adminSessionsControls}>
                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="mentor-filter">Filter by Mentor:</label>
                    <input
                        id="mentor-filter"
                        type="text"
                        name="mentor"
                        placeholder="Search mentors..."
                        value={filter.mentor}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className={styles.adminSessionsFilterControl}>
                    <label htmlFor="mentee-filter">Filter by Mentee:</label>
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
                    <label htmlFor="attendee-filter">Filter by Attendee:</label>
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
                    <label htmlFor="cancelled-filter">Status:</label>
                    <select
                        id="cancelled-filter"
                        name="cancelled"
                        value={filter.cancelled}
                        onChange={handleFilterChange}
                    >
                        <option value="all">All Sessions</option>
                        <option value="active">Running Only</option>
                        <option value="cancelled">Cancelled Only</option>
                    </select>
                </div>
            </div>
            <div className={styles.adminSessionsSessionsCount}>
                Showing {displayedSessions.length} session{displayedSessions.length !== 1 ? 's' : ''}
            </div>
            <div className={styles.adminSessionsSessionsTable}>
                <table className={styles.adminSessionsDataTable}>
                    <thead>
                    <tr>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("time")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("time");}}} aria-sort={sortState.column==="time" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Time <span className={`${styles.sortIndicator} ${sortState.column==="time" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="time" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("mentor")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("mentor");}}} aria-sort={sortState.column==="mentor" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Mentor <span className={`${styles.sortIndicator} ${sortState.column==="mentor" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="mentor" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("mentee")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("mentee");}}} aria-sort={sortState.column==="mentee" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Mentee <span className={`${styles.sortIndicator} ${sortState.column==="mentee" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="mentee" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("airport")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("airport");}}} aria-sort={sortState.column==="airport" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Airport <span className={`${styles.sortIndicator} ${sortState.column==="airport" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="airport" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("pilots")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("pilots");}}} aria-sort={sortState.column==="pilots" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Pilot <span className={`${styles.sortIndicator} ${sortState.column==="pilots" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="pilots" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("cancelled")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("cancelled");}}} aria-sort={sortState.column==="cancelled" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Status <span className={`${styles.sortIndicator} ${sortState.column==="cancelled" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="cancelled" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
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
                            <td className={styles.adminSessionTimeCell} data-label="Time">{formatAdminUtcDate(session.time)}</td>
                            <td data-label="Mentor">{record.mentor}</td>
                            <td data-label="Mentee">{record.mentee}</td>
                            <td data-label="Airport">{record.airport}</td>
                            <td data-label="Pilot">{record.pilots}</td>
                            <td data-label="Status">
                                {record.cancelled ? (
                                    <span className={styles.adminCancelledBadge}>Cancelled</span>
                                ) : (
                                    <span className={styles.adminActiveBadge}>Running</span>
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
