import {type FormEvent, useEffect, useMemo, useState} from "react";
import {useNavigate, useParams} from "@/src/dashboard/next-navigation";
import type {AdminMentee, MenteeState} from "../../types/AdminMentee.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import type {Session} from "../../types/Session.ts";
import type {UserNote} from "../../types/UserNote.ts";
import type {AdminAssignment, AssignmentSlotAssignments} from "../../types/AdminAssignment.ts";
import type {SessionAssignment} from "../../types/SessionAssignment.ts";
import {usePagination} from "../../hooks/usePagination.ts";
import {
    formatAdminUtcDate,
    formatIfcDisplay,
    generateHalfHourUtcDateTimeSuggestions,
    parseUtcDateTimeInput
} from "../../utils/AdminDateUtils.ts";
import {createSessionEditForm, toSessionUpdatePayload, type SessionEditForm} from "../../utils/SessionEditForm.ts";
import {getMenteeActionPolicy} from "../../utils/AdminMenteeActionPolicy.ts";
import {
    autoFillAssignmentSlots,
    generateAssignmentText,
    getAssignmentSlotKey
} from "../../utils/AssignmentGenerator.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import {
    chooseSessionAssignmentTemplateId,
    parseSessionAssignmentSlots,
} from "../../utils/SessionAssignmentHydration.ts";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import AdminToast from "./AdminToast.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import AdminPagination from "./AdminPagination.tsx";
import styles from "./AdminMentees.module.css";

interface AdminMenteesProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    users: AtcmhUser[] | undefined;
    mentees: AdminMentee[] | undefined;
    sessions: Session[] | undefined;
    userNotes: UserNote[] | undefined;
    adminUser: AdminUser | undefined;
    assignments: AdminAssignment[] | undefined;
    token: string | null;
    onMenteeChanged: (mentee: AdminMentee) => void;
    onSessionChanged: (menteeRecordId: number, session: Session) => void;
    onSessionAssignmentSaved: (menteeRecordId: number, sessionId: number) => void;
}

const stateLabels: Record<AdminMentee["state"], string> = {
    waitlisted: "Waitlisted",
    picked_up: "Picked up",
    passed: "Passed",
    terminated: "Terminated",
};

const AdminMentees = ({
                          loaded,
                          loggedIn,
                          error,
                          users,
                          mentees,
                          sessions,
                          userNotes,
                          adminUser,
                          assignments,
                          token,
                          onMenteeChanged,
                          onSessionChanged,
                          onSessionAssignmentSaved
                      }: AdminMenteesProps) => {
    const navigate = useNavigate();
    const {menteeRecordId} = useParams();
    const [filter, setFilter] = useState("");
    const [mentorFilter, setMentorFilter] = useState("all");
    const [actionError, setActionError] = useState<string | undefined>();
    const [busyAction, setBusyAction] = useState<string | undefined>();
    const [showTerminateModal, setShowTerminateModal] = useState(false);
    const [terminateReason, setTerminateReason] = useState("");
    const [sessionForm, setSessionForm] = useState({mentorId: "", airport: "", pilots: "1", time: ""});
    const [attendeeInputs, setAttendeeInputs] = useState<Record<string, string>>({});
    const [assignmentSession, setAssignmentSession] = useState<{
        session: Session;
        existingAssignment?: SessionAssignment
    } | undefined>();

    const usersById = useMemo(() => new Map(users?.map(user => [user.id, user]) ?? []), [users]);

    const selectedMentee = useMemo(() => {
        if (!mentees) return mentees?.[0];
        return mentees.find(mentee => String(mentee.id) === menteeRecordId) ?? mentees[0];
    }, [menteeRecordId, mentees]);

    const displayedMentees = useMemo(() => {
        const normalized = filter.trim().toLowerCase();
        if (!mentees) return [];
        return mentees.filter(mentee => {
            if (mentorFilter === "mine" && adminUser && getAssignedMentorId(mentee) !== adminUser.id) {
                return false;
            }
            if (mentorFilter === "waitlist" && (getAssignedMentorId(mentee) != null || mentee.state !== "waitlisted")) {
                return false;
            }
            if (!normalized) {
                return true;
            }

            const user = usersById.get(mentee.mentee);
            const mentorId = getAssignedMentorId(mentee);
            return [
                String(mentee.id),
                String(mentee.mentee),
                mentorId == null ? undefined : String(mentorId),
                user?.username,
                mentorId == null ? undefined : getUserNameFromMap(usersById, mentorId),
                mentee.ifcName,
                mentee.ifcId,
                mentee.recruiter,
                stateLabels[mentee.state],
            ].filter(Boolean).join(" ").toLowerCase().includes(normalized);
        });
    }, [adminUser, filter, mentees, mentorFilter, usersById]);

    const menteePagination = usePagination(displayedMentees, 50);

    const selectedSessions = useMemo(() => {
        const sessions = selectedMentee?.sessions ?? [];
        const now = Date.now();
        return {
            future: sessions.filter(session => new Date(session.time).getTime() >= now).sort(sortSessionsAsc),
            past: sessions.filter(session => new Date(session.time).getTime() < now).sort(sortSessionsDesc),
        };
    }, [selectedMentee]);

    const attendedSessions = useMemo(() => {
        if (!selectedMentee) return [];
        return sessions?.filter(session => {
            return session.attendees.includes(selectedMentee.mentee);
        }) || [];
    }, [sessions, selectedMentee]);

    const selectedMenteeNotes = useMemo(() => {
        if (!selectedMentee || !userNotes) return [];
        return userNotes
            .filter(note => note.user === selectedMentee.mentee)
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    }, [selectedMentee, userNotes]);
    const sessionTimeSuggestions = useMemo(() => generateHalfHourUtcDateTimeSuggestions(), []);

    const selectedMenteeHasMentor = selectedMentee ? getAssignedMentorId(selectedMentee) != null : false;
    const selectedActionPolicy = selectedMentee
        ? getMenteeActionPolicy({state: selectedMentee.state, hasMentor: selectedMenteeHasMentor})
        : undefined;
    const menteeSummary = useMemo(() => {
        const waitlisted = mentees?.filter(mentee => mentee.state === "waitlisted").length ?? 0;
        const activeMentorships = mentees?.filter(mentee => mentee.state === "picked_up").length ?? 0;
        const futureSessions = mentees?.reduce((total, mentee) => {
            return total + mentee.sessions.filter(session => !session.cancelled && new Date(session.time).getTime() >= Date.now()).length;
        }, 0) ?? 0;

        return {waitlisted, activeMentorships, futureSessions};
    }, [mentees]);

    const getUserName = (id?: string) => {
        if (!id) return "Not set";
        const user = usersById.get(id);
        return user ? user.username : `User (${id})`;
    };

    const runAction = async <T, >(name: string, action: () => Promise<T | undefined>, onSuccess: (result: T) => void) => {
        setActionError(undefined);
        setBusyAction(name);
        try {
            const result = await action();
            if (result) {
                onSuccess(result);
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusyAction(undefined);
        }
    };

    const doPickup = () => {
        if (!selectedMentee) return;
        if (!selectedActionPolicy?.canPickup) return;
        if (selectedMenteeHasMentor) {
            setActionError("This mentee already has a mentor.");
            return;
        }
        void runAction("pickup", () => ApiUtils.pickupMentee(token, selectedMentee.id), onMenteeChanged);
    };

    const handleTerminateClick = () => {
        if (!selectedActionPolicy?.canTerminate) return;
        setTerminateReason("");
        setShowTerminateModal(true);
    };

    const handleTerminateConfirm = (event: FormEvent) => {
        event.preventDefault();
        if (!selectedMentee) return;
        if (!selectedActionPolicy?.canTerminate) return;
        void runAction("terminate", () => ApiUtils.terminateMentee(token, selectedMentee.id, terminateReason), onMenteeChanged);
        setShowTerminateModal(false);
    };

    const handlePass = async () => {
        if (!selectedMentee || !selectedActionPolicy?.canPass) return;
        if (!window.confirm("Mark this mentee as passed?")) return;
        setBusyAction("pass");
        try {
            const updated = await ApiUtils.passMentee(token, selectedMentee.id);
            if (updated) {
                onMenteeChanged(updated);
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusyAction(undefined);
        }
    };

    const handleSchedule = (event: FormEvent) => {
        event.preventDefault();
        if (!selectedMentee) return;
        if (!selectedActionPolicy?.canSchedule) return;
        void runAction("schedule", () => ApiUtils.scheduleMenteeSession(token, selectedMentee.id, {
            mentorId: parseOptionalNumber(sessionForm.mentorId),
            airport: sessionForm.airport,
            pilots: Number(sessionForm.pilots),
            time: parseUtcDateTimeInput(sessionForm.time),
        }), session => onSessionChanged(selectedMentee.id, session));
    };

    const handleCancelSession = async (sessionId: number) => {
        if (!selectedMentee) return undefined;

        setActionError(undefined);
        setBusyAction(`cancel-${sessionId}`);
        try {
            const updatedSession = await ApiUtils.cancelMenteeSession(token, selectedMentee.id, sessionId);
            if (updatedSession) {
                onSessionChanged(selectedMentee.id, updatedSession);
            }
            return updatedSession;
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
            return undefined;
        } finally {
            setBusyAction(undefined);
        }
    };

    const handleUpdateSession = async (sessionId: number, form: SessionEditForm) => {
        if (!selectedMentee) return undefined;

        setActionError(undefined);
        setBusyAction(`update-session-${sessionId}`);
        try {
            const updatedSession = await ApiUtils.updateMenteeSession(token, selectedMentee.id, sessionId, toSessionUpdatePayload(form));
            if (updatedSession) {
                onSessionChanged(selectedMentee.id, updatedSession);
            }
            return updatedSession;
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
            return undefined;
        } finally {
            setBusyAction(undefined);
        }
    };

    const handleAddAttendee = async (event: FormEvent, sessionId: number) => {
        event.preventDefault();
        if (!selectedMentee) return undefined;
        const attendeeId = attendeeInputs[sessionId]?.trim();
        if (!attendeeId) {
            setActionError("Enter a valid attendee Discord ID.");
            return undefined;
        }

        setActionError(undefined);
        setBusyAction(`add-attendee-${sessionId}`);
        try {
            const updatedSession = await ApiUtils.addMenteeSessionAttendee(token, selectedMentee.id, sessionId, attendeeId);
            if (updatedSession) {
                onSessionChanged(selectedMentee.id, updatedSession);
                setAttendeeInputs(prev => ({...prev, [sessionId]: ""}));
            }
            return updatedSession;
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
            return undefined;
        } finally {
            setBusyAction(undefined);
        }
    };

    const handleRemoveAttendee = async (sessionId: number, attendeeId: string) => {
        if (!selectedMentee) return undefined;

        setActionError(undefined);
        setBusyAction(`remove-attendee-${sessionId}-${attendeeId}`);
        try {
            const updatedSession = await ApiUtils.removeMenteeSessionAttendee(token, selectedMentee.id, sessionId, attendeeId);
            if (updatedSession) {
                onSessionChanged(selectedMentee.id, updatedSession);
            }
            return updatedSession;
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
            return undefined;
        } finally {
            setBusyAction(undefined);
        }
    };

    const stateStripColor: Record<MenteeState, string> = {
        waitlisted: "var(--warning-bg)",
        picked_up: "var(--info-bg)",
        terminated: "var(--danger-bg)",
        passed: "var(--success-bg)",
    };

    if (!loggedIn) {
        return <AdminLoginScreen/>;
    }

    if (!loaded) {
        return <AdminLoadingScreen/>;
    }

    if (error) {
        return <AdminErrorScreen content={error}/>;
    }

    if (!users || !mentees || !userNotes || !assignments) {
        return <AdminUnauthorizedScreen/>;
    }

    return (
        <div className={styles.adminMenteesContainer}>
            <div className={styles.inlineStatsRow} aria-label="Mentee overview">
                    <span className={styles.statSegment}>
                        <span className={styles.statValue}>{menteeSummary.waitlisted}</span>
                        <span className={styles.statLabel}>Waitlist</span>
                    </span>
                    <span className={styles.statSegment}>
                        <span className={styles.statValue}>{menteeSummary.activeMentorships}</span>
                        <span className={styles.statLabel}>Active</span>
                    </span>
                    <span className={styles.statSegment}>
                        <span className={styles.statValue}>{menteeSummary.futureSessions}</span>
                        <span className={styles.statLabel}>Future sessions</span>
                    </span>
            </div>

            <div className={styles.adminMenteesLayout}>
                <aside className={styles.menteeListPanel}>
                    <div className={styles.panelHeader}>
                        <h2>Mentees</h2>
                        <span>{menteePagination.paginatedItems.length}/{mentees.length}</span>
                    </div>
                    <label className={styles.searchLabel} htmlFor="mentee-search">Search mentees</label>
                    <input
                        id="mentee-search"
                        value={filter}
                        onChange={event => setFilter(event.target.value)}
                        placeholder="Name, Discord ID, IFC, recruiter..."
                    />
                    <label className={styles.searchLabel} htmlFor="mentor-filter">Mentor filter</label>
                    <select
                        id="mentor-filter"
                        className={styles.mentorFilterSelect}
                        value={mentorFilter}
                        onChange={event => setMentorFilter(event.target.value)}
                    >
                        <option value="all">All mentees</option>
                        <option value="mine" disabled={!adminUser}>My mentees</option>
                        <option value="waitlist">Waitlist</option>
                    </select>

                    <div className={styles.menteeList} aria-label="Mentees">
                        {menteePagination.paginatedItems.map(mentee => (
                            <button
                                key={mentee.id}
                                type="button"
                                className={`${styles.menteeListItem} ${selectedMentee?.id === mentee.id ? styles.menteeListItemActive : ""}`}
                                onClick={() => navigate(`/dashboard/mentees/${mentee.id}`)}
                            >
                                <span>{getUserName(mentee.mentee)}</span>
                                <small>
                                    <span className={`${styles.menteeStateText} ${styles[`${mentee.state}Text`]}`}>
                                        {stateLabels[mentee.state]}
                                    </span>
                                    {" - "}
                                    {formatAdminUtcDate(mentee.waitlistTime)}
                                </small>
                            </button>
                        ))}
                    </div>
                    <AdminPagination
                        {...menteePagination}
                        totalItems={menteePagination.totalItems}
                        variant="inline"
                        className={styles.menteeListPagination}
                    />
                </aside>

                <main
                    className={styles.menteeDetailPanel}
                    style={{["--strip-color" as string]: stateStripColor[selectedMentee?.state || 'waitlisted']}}
                >
                    {selectedMentee ? (
                        <>
                            <header className={styles.detailHeader}>
                                <div>
                                    <h2>{getUserName(selectedMentee.mentee)}</h2>
                                </div>
                                <div className={styles.eyebrowActions}>
                                    <div className={styles.stateActionButtonRow}>
                                        {selectedActionPolicy?.canPickup ? (
                                            <button type="button" onClick={doPickup} disabled={busyAction === "pickup"}>
                                                Pickup
                                            </button>
                                        ) : null}
                                        {selectedActionPolicy?.canTerminate ? (
                                            <button type="button" onClick={handleTerminateClick}
                                                    disabled={busyAction === "terminate"}>
                                                Terminate
                                            </button>
                                        ) : null}
                                        {selectedActionPolicy?.canPass ? (
                                            <button type="button" onClick={handlePass} disabled={busyAction === "pass"}>
                                                Pass
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </header>

                            <AdminToast message={actionError} onDismiss={() => setActionError(undefined)}/>

                            <section className={styles.detailGrid} aria-label="Mentee details">
                                <DetailItem label="Waitlist time"
                                            value={formatAdminUtcDate(selectedMentee.waitlistTime)}/>
                                <DetailItem label="Pickup time" value={formatAdminUtcDate(selectedMentee.pickupTime)}/>
                                <DetailItem label="Pass time" value={formatAdminUtcDate(selectedMentee.passedTime)}/>
                                <DetailItem label="Termination time"
                                            value={formatAdminUtcDate(selectedMentee.terminatedTime)}/>
                                <DetailItem label="Mentor" value={getUserName(getAssignedMentorId(selectedMentee))}/>
                                <DetailItem label="Recruiter" value={selectedMentee.recruiter || "Not set"}/>
                                <DetailItem label="IFC" value={formatIfcDisplay(selectedMentee)}/>
                                {selectedMentee.terminationReason ? (
                                    <DetailItem label="Termination reason" value={selectedMentee.terminationReason}/>
                                ) : null}
                            </section>

                            <section className={styles.actionsGrid} aria-label="Mentee actions">
                                {selectedActionPolicy?.canSchedule ? (
                                    <form className={styles.actionPanel} onSubmit={handleSchedule}>
                                        <h3>Schedule Session</h3>
                                        <input
                                            value={sessionForm.mentorId}
                                            onChange={event => setSessionForm(prev => ({
                                                ...prev,
                                                mentorId: event.target.value
                                            }))}
                                            placeholder="Mentor Discord ID (blank for you)"
                                        />
                                        <div className={styles.inlineInputs}>
                                            <input
                                                value={sessionForm.airport}
                                                onChange={event => setSessionForm(prev => ({
                                                    ...prev,
                                                    airport: event.target.value.toUpperCase()
                                                }))}
                                                placeholder="Airport"
                                                maxLength={5}
                                                required
                                            />
                                            <input
                                                type="number"
                                                min="1"
                                                max="99"
                                                value={sessionForm.pilots}
                                                onChange={event => setSessionForm(prev => ({
                                                    ...prev,
                                                    pilots: event.target.value
                                                }))}
                                                required
                                            />
                                        </div>
                                        <label className={styles.utcDateTimeLabel}>
                                            <span>Session time</span>
                                            <input
                                                type="datetime-local"
                                                list="session-time-suggestions"
                                                value={sessionForm.time}
                                                onChange={event => setSessionForm(prev => ({
                                                    ...prev,
                                                    time: event.target.value
                                                }))}
                                                required
                                            />
                                            <datalist id="session-time-suggestions">
                                                {sessionTimeSuggestions.map(value => (
                                                    <option key={value} value={value}/>
                                                ))}
                                            </datalist>
                                        </label>
                                        <button type="submit" disabled={busyAction === "schedule"}>Schedule</button>
                                    </form>
                                ) : null}
                            </section>

                            <UserNotesSection
                                notes={selectedMenteeNotes}
                                getUserName={getUserName}
                            />

                            <SessionSection
                                title="Future Sessions"
                                sessions={selectedSessions.future}
                                getUserName={getUserName}
                                editable
                                busyAction={busyAction}
                                attendeeInputs={attendeeInputs}
                                assignments={assignments}
                                sessionTimeSuggestions={sessionTimeSuggestions}
                                onAttendeeInputChange={(sessionId, value) => setAttendeeInputs(prev => ({
                                    ...prev,
                                    [sessionId]: value
                                }))}
                                onUpdateSession={handleUpdateSession}
                                onAddAttendee={handleAddAttendee}
                                onRemoveAttendee={handleRemoveAttendee}
                                onCancelSession={handleCancelSession}
                                onOpenAssignmentGenerator={(session, existingAssignment) => setAssignmentSession({
                                    session,
                                    existingAssignment
                                })}
                            />

                            <SessionSection
                                title="Past Sessions"
                                sessions={selectedSessions.past}
                                getUserName={getUserName}
                                editable
                                busyAction={busyAction}
                                attendeeInputs={attendeeInputs}
                                assignments={assignments}
                                sessionTimeSuggestions={sessionTimeSuggestions}
                                onAttendeeInputChange={(sessionId, value) => setAttendeeInputs(prev => ({
                                    ...prev,
                                    [sessionId]: value
                                }))}
                                onUpdateSession={handleUpdateSession}
                                onAddAttendee={handleAddAttendee}
                                onRemoveAttendee={handleRemoveAttendee}
                                onCancelSession={handleCancelSession}
                                onOpenAssignmentGenerator={(session, existingAssignment) => setAssignmentSession({
                                    session,
                                    existingAssignment
                                })}
                            />

                            <AttendedSessionSection
                                title="Attended sessions"
                                sessions={attendedSessions}
                                getUserName={getUserName}
                                editable={false}
                                busyAction={busyAction}
                                attendeeInputs={attendeeInputs}
                                assignments={assignments}
                                sessionTimeSuggestions={sessionTimeSuggestions}
                                onAttendeeInputChange={(sessionId, value) => setAttendeeInputs(prev => ({
                                    ...prev,
                                    [sessionId]: value
                                }))}
                                onUpdateSession={handleUpdateSession}
                                onAddAttendee={handleAddAttendee}
                                onRemoveAttendee={handleRemoveAttendee}
                                onCancelSession={handleCancelSession}
                                onOpenAssignmentGenerator={(session, existingAssignment) => setAssignmentSession({
                                    session,
                                    existingAssignment
                                })}
                            />
                        </>
                    ) : (
                        <div className={styles.emptyState}>No mentees are available.</div>
                    )}
                </main>

                {showTerminateModal && (
                    <div className={styles.modalBackdrop} onClick={() => setShowTerminateModal(false)} onKeyDown={e => {
                        if (e.key === "Escape") setShowTerminateModal(false);
                    }}>
                        <div className={styles.terminateModal} onClick={e => e.stopPropagation()}>
                            <h3>Terminate Mentee</h3>
                            <form onSubmit={handleTerminateConfirm}>
                                <textarea
                                    value={terminateReason}
                                    onChange={e => setTerminateReason(e.target.value)}
                                    placeholder="Reason for termination"
                                    required
                                    autoFocus
                                />
                                <div className={styles.modalActions}>
                                    <button type="button" onClick={() => setShowTerminateModal(false)}>Cancel</button>
                                    <button type="submit" disabled={busyAction === "terminate"}>Confirm Terminate
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
            {assignmentSession && selectedMentee ? (
                <AssignmentGeneratorModal
                    token={token}
                    session={assignmentSession.session}
                    mentee={selectedMentee}
                    assignments={assignments}
                    adminUser={adminUser}
                    getUserName={getUserName}
                    onClose={() => setAssignmentSession(undefined)}
                    onAssignmentSaved={() => onSessionAssignmentSaved(selectedMentee.id, assignmentSession.session.id)}
                    onError={setActionError}
                    existingAssignment={assignmentSession.existingAssignment}
                />
            ) : null}
        </div>
    );
};

const DetailItem = ({label, value}: { label: string; value: string }) => (
    <div className={styles.detailItem}>
        <span>{label}</span>
        <strong>{value}</strong>
    </div>
);

const UserNotesSection = ({notes, getUserName}: { notes: UserNote[]; getUserName: (id?: string) => string }) => (
    <section className={styles.userNotesSection}>
        <h3>Mentee User Notes</h3>
        {notes.length === 0 ? (
            <p className={styles.emptyState}>No user notes for this mentee.</p>
        ) : (
            <div className={styles.userNotesList}>
                {notes.map(note => (
                    <article key={note.id}
                             className={`${styles.userNoteItem} ${note.active ? "" : styles.inactiveUserNote}`}>
                        <div className={styles.userNoteMeta}>
                            <span>{formatAdminUtcDate(note.time)}</span>
                            <span>{getUserName(note.staff)}</span>
                            <span>{note.active ? "Active" : "Inactive"}</span>
                        </div>
                        <p>{note.note}</p>
                    </article>
                ))}
            </div>
        )}
    </section>
);

interface SessionSectionProps {
    title: string;
    sessions: Session[];
    getUserName: (id?: string) => string;
    editable: boolean;
    busyAction: string | undefined;
    attendeeInputs: Record<string, string>;
    assignments: AdminAssignment[];
    sessionTimeSuggestions: string[];
    onAttendeeInputChange: (sessionId: number, value: string) => void;
    onUpdateSession: (sessionId: number, form: SessionEditForm) => Promise<Session | undefined>;
    onAddAttendee: (event: FormEvent, sessionId: number) => Promise<Session | undefined>;
    onRemoveAttendee: (sessionId: number, attendeeId: string) => Promise<Session | undefined>;
    onCancelSession: (sessionId: number) => Promise<Session | undefined>;
    onOpenAssignmentGenerator: (session: Session, existingAssignment?: SessionAssignment) => void;
}

const SessionSection = ({
                            title,
                            sessions,
                            getUserName,
                            editable,
                            busyAction,
                            attendeeInputs,
                            assignments,
                            sessionTimeSuggestions,
                            onAttendeeInputChange,
                            onUpdateSession,
                            onAddAttendee,
                            onRemoveAttendee,
                            onCancelSession,
                            onOpenAssignmentGenerator
                        }: SessionSectionProps) => {
    const [viewedSession, setViewedSession] = useState<Session | undefined>();

    return (
        <section className={styles.sessionsSection}>
            <h3>{title}</h3>
            {sessions.length === 0 ? (
                <p className={styles.emptyState}>No {title.toLowerCase()}.</p>
            ) : (
                <div className={styles.sessionsTableWrap}>
                    <table
                        className={`${styles.sessionsTable} ${editable ? styles.sessionsTableEditable : styles.sessionsTableReadonly}`}>
                        <thead>
                        <tr>
                            <th>Time</th>
                            <th>Mentor</th>
                            <th>Airport</th>
                            <th>Pilots</th>
                            <th>Status</th>
                            <th>Attendees</th>
                            <th>Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {sessions.map(session => (
                            <tr key={session.id} className={session.cancelled ? styles.cancelledSession : undefined}>
                                <td data-label="Time">{formatAdminUtcDate(session.time, {showUtcSuffix: false})}</td>
                                <td data-label="Mentor">{getUserName(session.mentor)}</td>
                                <td data-label="Airport">{session.airport || "Not set"}</td>
                                <td data-label="Pilots">{formatPilotCount(session)}</td>
                                <td data-label="Status">
                                    <span
                                        className={`${styles.sessionStatus} ${session.cancelled ? styles.sessionStatusCancelled : styles.sessionStatusScheduled}`}>
                                        {session.cancelled ? "Cancelled" : "Scheduled"}
                                    </span>
                                </td>
                                <td data-label="Attendees">
                                    <span className={styles.readOnlySession}>
                                        {session.attendees.length}
                                    </span>
                                </td>
                                <td data-label="Actions">
                                    <div className={styles.sessionRowActions}>
                                        <button
                                            type="button"
                                            className={styles.secondaryButton}
                                            onClick={() => setViewedSession(session)}
                                        >
                                            View
                                        </button>
                                        {!session.cancelled ? (
                                            session.hasAssignment ? (
                                                <button
                                                    type="button"
                                                    className={styles.assignmentButton}
                                                    onClick={() => onOpenAssignmentGenerator(session, undefined)}
                                                    disabled={assignments.length === 0}
                                                >
                                                    Edit
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={styles.assignmentButton}
                                                    onClick={() => onOpenAssignmentGenerator(session)}
                                                    disabled={assignments.length === 0}
                                                >
                                                    Generate
                                                </button>
                                            )
                                        ) : null}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}

            {viewedSession ? (
                <SessionDetailsModal
                    session={viewedSession}
                    getUserName={getUserName}
                    editable={editable}
                    busyAction={busyAction}
                    attendeeInput={attendeeInputs[viewedSession.id] ?? ""}
                    sessionTimeSuggestions={sessionTimeSuggestions}
                    onAttendeeInputChange={value => onAttendeeInputChange(viewedSession.id, value)}
                    onUpdateSession={async form => {
                        const updatedSession = await onUpdateSession(viewedSession.id, form);
                        if (updatedSession) {
                            setViewedSession(updatedSession);
                        }
                        return updatedSession;
                    }}
                    onAddAttendee={async event => {
                        const updatedSession = await onAddAttendee(event, viewedSession.id);
                        if (updatedSession) {
                            setViewedSession(updatedSession);
                        }
                        return updatedSession;
                    }}
                    onRemoveAttendee={async attendeeId => {
                        const updatedSession = await onRemoveAttendee(viewedSession.id, attendeeId);
                        if (updatedSession) {
                            setViewedSession(updatedSession);
                        }
                        return updatedSession;
                    }}
                    onCancelSession={async () => {
                        const updatedSession = await onCancelSession(viewedSession.id);
                        if (updatedSession) {
                            setViewedSession(updatedSession);
                        }
                        return updatedSession;
                    }}
                    onClose={() => setViewedSession(undefined)}
                />
            ) : null}
        </section>
    );
};

const AttendedSessionSection = ({
                                    title,
                                    sessions,
                                    getUserName,
                                    editable,
                                    busyAction,
                                    attendeeInputs,
                                    sessionTimeSuggestions,
                                    onAttendeeInputChange,
                                    onUpdateSession,
                                    onAddAttendee,
                                    onRemoveAttendee,
                                    onCancelSession
                                }: SessionSectionProps) => {
    const [viewedSession, setViewedSession] = useState<Session | undefined>();

    return (
        <section className={styles.sessionsSection}>
            <h3>{title}</h3>
            {sessions.length === 0 ? (
                <p className={styles.emptyState}>No {title.toLowerCase()}.</p>
            ) : (
                <div className={styles.sessionsTableWrap}>
                    <table
                        className={`${styles.sessionsTable} ${editable ? styles.sessionsTableEditable : styles.sessionsTableReadonly}`}>
                        <thead>
                        <tr>
                            <th>Time</th>
                            <th>Mentor</th>
                            <th>Airport</th>
                            <th>Pilots</th>
                            <th>Status</th>
                            <th>Attendees</th>
                            <th>Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {sessions.map(session => (
                            <tr key={session.id} className={session.cancelled ? styles.cancelledSession : undefined}>
                                <td data-label="Time">{formatAdminUtcDate(session.time, {showUtcSuffix: false})}</td>
                                <td data-label="Mentor">{getUserName(session.mentor)}</td>
                                <td data-label="Airport">{session.airport || "Not set"}</td>
                                <td data-label="Pilots">{formatPilotCount(session)}</td>
                                <td data-label="Status">
                                    <span
                                        className={`${styles.sessionStatus} ${session.cancelled ? styles.sessionStatusCancelled : styles.sessionStatusScheduled}`}>
                                        {session.cancelled ? "Cancelled" : "Scheduled"}
                                    </span>
                                </td>
                                <td data-label="Attendees">
                                    <span className={styles.readOnlySession}>
                                        {session.attendees.length}
                                    </span>
                                </td>
                                <td data-label="Actions">
                                    <div className={styles.sessionRowActions}>
                                        <button
                                            type="button"
                                            className={styles.secondaryButton}
                                            onClick={() => setViewedSession(session)}
                                        >
                                            View
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}

            {viewedSession ? (
                <SessionDetailsModal
                    session={viewedSession}
                    getUserName={getUserName}
                    editable={editable}
                    busyAction={busyAction}
                    attendeeInput={attendeeInputs[viewedSession.id] ?? ""}
                    sessionTimeSuggestions={sessionTimeSuggestions}
                    onAttendeeInputChange={value => onAttendeeInputChange(viewedSession.id, value)}
                    onUpdateSession={async form => {
                        const updatedSession = await onUpdateSession(viewedSession.id, form);
                        if (updatedSession) {
                            setViewedSession(updatedSession);
                        }
                        return updatedSession;
                    }}
                    onAddAttendee={async event => {
                        const updatedSession = await onAddAttendee(event, viewedSession.id);
                        if (updatedSession) {
                            setViewedSession(updatedSession);
                        }
                        return updatedSession;
                    }}
                    onRemoveAttendee={async attendeeId => {
                        const updatedSession = await onRemoveAttendee(viewedSession.id, attendeeId);
                        if (updatedSession) {
                            setViewedSession(updatedSession);
                        }
                        return updatedSession;
                    }}
                    onCancelSession={async () => {
                        const updatedSession = await onCancelSession(viewedSession.id);
                        if (updatedSession) {
                            setViewedSession(updatedSession);
                        }
                        return updatedSession;
                    }}
                    onClose={() => setViewedSession(undefined)}
                />
            ) : null}
        </section>
    );
};

interface SessionDetailsModalProps {
    session: Session;
    getUserName: (id?: string) => string;
    editable: boolean;
    busyAction: string | undefined;
    attendeeInput: string;
    sessionTimeSuggestions: string[];
    onAttendeeInputChange: (value: string) => void;
    onUpdateSession: (form: SessionEditForm) => Promise<Session | undefined>;
    onAddAttendee: (event: FormEvent) => Promise<Session | undefined>;
    onRemoveAttendee: (attendeeId: string) => Promise<Session | undefined>;
    onCancelSession: () => Promise<Session | undefined>;
    onClose: () => void;
}

const SessionDetailsModal = ({
                                 session,
                                 getUserName,
                                 editable,
                                 busyAction,
                                 attendeeInput,
                                 sessionTimeSuggestions,
                                 onAttendeeInputChange,
                                 onUpdateSession,
                                 onAddAttendee,
                                 onRemoveAttendee,
                                 onCancelSession,
                                 onClose
                             }: SessionDetailsModalProps) => {
    const sessionEditable = editable && !session.cancelled;
    const [editForm, setEditForm] = useState(() => createSessionEditForm(session));
    const [editState, setEditState] = useState("");

    useEffect(() => {
        setEditForm(createSessionEditForm(session));
        setEditState("");
    }, [session]);

    const submitSessionUpdate = async (event: FormEvent) => {
        event.preventDefault();
        setEditState("Saving...");
        const updatedSession = await onUpdateSession(editForm);
        setEditState(updatedSession ? "Saved" : "");
    };

    return (
        <div className={styles.sessionDetailsOverlay} role="presentation">
            <div className={styles.sessionDetailsModal} role="dialog" aria-modal="true"
                 aria-labelledby={`session-details-${session.id}`}>
                <header className={styles.sessionDetailsHeader}>
                    <div>
                        <h2 id={`session-details-${session.id}`}>Session Details</h2>
                        <p>{formatAdminUtcDate(session.time, {showUtcSuffix: false})}</p>
                    </div>
                    <button type="button" className={styles.secondaryButton} onClick={onClose}>Close</button>
                </header>

                <section className={styles.sessionDetailsGrid} aria-label="Session details">
                    <DetailItem label="Mentor" value={getUserName(session.mentor)}/>
                    <DetailItem label="Mentor" value={getUserName(session.mentee)}/>
                    <DetailItem label="Airport" value={session.airport || "Not set"}/>
                    <DetailItem label="Pilots" value={formatPilotCount(session)}/>
                    <DetailItem label="Assignment" value={session.hasAssignment ? "Sent" : "Not sent"}/>
                    <div className={styles.detailItem}>
                        <span>Status</span>
                        <strong>{session.cancelled ? "Cancelled" : "Scheduled"}</strong>
                    </div>
                    {session.messageId ? <DetailItem label="Message ID" value={session.messageId}/> : null}
                </section>

                {sessionEditable ? (
                    <section className={styles.sessionDetailsBlock}>
                        <h3>Edit Session</h3>
                        <form className={styles.sessionEditForm} onSubmit={submitSessionUpdate}>
                            <label>
                                <span>Airport</span>
                                <input
                                    value={editForm.airport}
                                    onChange={event => {
                                        setEditForm(prev => ({...prev, airport: event.target.value.toUpperCase()}));
                                        setEditState("");
                                    }}
                                    maxLength={5}
                                    required
                                />
                            </label>
                            <label>
                                <span>Requested pilots</span>
                                <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={editForm.pilots}
                                    onChange={event => {
                                        setEditForm(prev => ({...prev, pilots: event.target.value}));
                                        setEditState("");
                                    }}
                                    required
                                />
                            </label>
                            <label>
                                <span>Session time</span>
                                <input
                                    type="datetime-local"
                                    list={`session-time-suggestions-${session.id}`}
                                    value={editForm.time}
                                    onChange={event => {
                                        setEditForm(prev => ({...prev, time: event.target.value}));
                                        setEditState("");
                                    }}
                                    required
                                />
                                <datalist id={`session-time-suggestions-${session.id}`}>
                                    {sessionTimeSuggestions.map(value => (
                                        <option key={value} value={value}/>
                                    ))}
                                </datalist>
                            </label>
                            <div className={styles.sessionEditActions}>
                                <span>{editState}</span>
                                <button type="submit" disabled={Boolean(busyAction)}>Save Changes</button>
                            </div>
                        </form>
                    </section>
                ) : null}

                <section className={styles.sessionDetailsBlock}>
                    <h3>Attendees</h3>
                    {session.attendees.length === 0 ? (
                        <p className={styles.emptyState}>No attendees added.</p>
                    ) : (
                        <div className={styles.attendeesList}>
                            {session.attendees.map(attendeeId => (
                                <span key={attendeeId} className={styles.attendeeItem}>
                                    {getUserName(attendeeId)}
                                    {sessionEditable ? (
                                        <button
                                            type="button"
                                            onClick={() => onRemoveAttendee(attendeeId)}
                                            disabled={Boolean(busyAction)}
                                            aria-label={`Remove ${getUserName(attendeeId)}`}
                                        >
                                            Remove
                                        </button>
                                    ) : null}
                                </span>
                            ))}
                        </div>
                    )}
                </section>

                {sessionEditable ? (
                    <section className={styles.sessionDetailsBlock}>
                        <h3>Actions</h3>
                        <div className={styles.sessionActions}>
                            <form onSubmit={onAddAttendee}>
                                <input
                                    value={attendeeInput}
                                    onChange={event => onAttendeeInputChange(event.target.value)}
                                    placeholder="Attendee Discord ID"
                                />
                                <button type="submit" disabled={Boolean(busyAction)}>Add</button>
                            </form>
                            <button
                                type="button"
                                onClick={onCancelSession}
                                disabled={Boolean(busyAction)}
                            >
                                Cancel Session
                            </button>
                        </div>
                    </section>
                ) : null}
            </div>
        </div>
    );
};

interface AssignmentGeneratorModalProps {
    token: string | null;
    session: Session;
    mentee: AdminMentee;
    assignments: AdminAssignment[];
    adminUser: AdminUser | undefined;
    getUserName: (id?: string) => string;
    onClose: () => void;
    onAssignmentSaved: () => void;
    onError: (message: string) => void;
    existingAssignment?: SessionAssignment;
}

const AssignmentGeneratorModal = ({
                                      token,
                                      session,
                                      mentee,
                                      assignments,
                                      adminUser,
                                      getUserName,
                                      onClose,
                                      onAssignmentSaved,
                                      onError,
                                      existingAssignment
                                  }: AssignmentGeneratorModalProps) => {
    const sessionAttendees = useMemo(() => Array.from(new Set(session.attendees.map(String))), [session.attendees]);
    const sortedAssignments = useMemo(() => {
        const airport = session.airport?.trim().toUpperCase();
        return [...assignments].sort((a, b) => {
            const aMatch = a.airport === airport ? 0 : 1;
            const bMatch = b.airport === airport ? 0 : 1;
            return aMatch - bMatch || a.airport.localeCompare(b.airport) || a.title.localeCompare(b.title);
        });
    }, [assignments, session.airport]);
    const defaultAssignment = sortedAssignments[0];
    const [fetchedAssignment, setFetchedAssignment] = useState<SessionAssignment | undefined>(existingAssignment);
    const initialAssignmentId = chooseSessionAssignmentTemplateId(existingAssignment, sortedAssignments, defaultAssignment?.id ?? 0);
    const [assignmentId, setAssignmentId] = useState(initialAssignmentId);
    const selectedAssignment = sortedAssignments.find(assignment => assignment.id === assignmentId) ?? defaultAssignment;
    const [slotAssignments, setSlotAssignments] = useState<AssignmentSlotAssignments>(() => (
        parseSessionAssignmentSlots(existingAssignment?.slotAssignmentsJson)
        ?? (selectedAssignment ? autoFillAssignmentSlots(selectedAssignment, sessionAttendees) : {})
    ));
    const [selectedAttendeeId, setSelectedAttendeeId] = useState<string | undefined>();
    const [previewOpen, setPreviewOpen] = useState(false);
    const [copyState, setCopyState] = useState("");
    const [sendState, setSendState] = useState("");
    const [sentThreadUrl, setSentThreadUrl] = useState<string | undefined>();
    const [sending, setSending] = useState(false);
    const [previewText, setPreviewText] = useState(existingAssignment?.content ?? "");
    const [previewDirty, setPreviewDirty] = useState(Boolean(existingAssignment?.content));

    const isEditMode = fetchedAssignment != null;

    useEffect(() => {
        if (session.hasAssignment && !existingAssignment) {
            ApiUtils.getSessionAssignment(token, mentee.id, session.id).then(data => {
                if (data) {
                    setFetchedAssignment(data);
                }
            }).catch(() => {
            });
        }
    }, [session.id, mentee.id, session.hasAssignment, existingAssignment, token]);

    useEffect(() => {
        if (!fetchedAssignment) return;

        const nextAssignmentId = chooseSessionAssignmentTemplateId(fetchedAssignment, sortedAssignments, defaultAssignment?.id ?? 0);
        const nextAssignment = sortedAssignments.find(assignment => assignment.id === nextAssignmentId) ?? defaultAssignment;
        setAssignmentId(nextAssignmentId);
        setSlotAssignments(
            parseSessionAssignmentSlots(fetchedAssignment.slotAssignmentsJson)
            ?? (nextAssignment ? autoFillAssignmentSlots(nextAssignment, sessionAttendees) : {})
        );
        setSentThreadUrl(fetchedAssignment.threadUrl || undefined);
        setPreviewText(fetchedAssignment.content);
        setPreviewDirty(true);
    }, [defaultAssignment, fetchedAssignment, sessionAttendees, sortedAssignments]);

    const assignedAttendees = useMemo(() => new Set(Object.values(slotAssignments).filter((id): id is string => id != null)), [slotAssignments]);
    const unassignedAttendees = useMemo(() => (
        sessionAttendees.filter(attendeeId => !assignedAttendees.has(attendeeId))
    ), [assignedAttendees, sessionAttendees]);
    const assignmentContext = useMemo(() => ({
        sessionCount: getMenteeSessionCount(mentee, session),
        mentee: formatIfcDisplay({ifcId: mentee.ifcId, ifcName: mentee.ifcName}),
        mentorTag: adminUser ? `<@${adminUser.id}>` : ``,
    }), [mentee, session, adminUser]);
    const generatedText = selectedAssignment ? generateAssignmentText(selectedAssignment, slotAssignments, assignmentContext) : "";
    const messageText = previewDirty ? previewText : generatedText;

    const resetPreviewText = () => {
        setPreviewDirty(false);
        setPreviewText("");
    };

    const changeAssignment = (nextAssignmentId: number) => {
        const nextAssignment = sortedAssignments.find(assignment => assignment.id === nextAssignmentId);
        setAssignmentId(nextAssignmentId);
        setSelectedAttendeeId(undefined);
        setCopyState("");
        setSendState("");
        setSentThreadUrl(undefined);
        resetPreviewText();
        setSlotAssignments(nextAssignment ? autoFillAssignmentSlots(nextAssignment, sessionAttendees) : {});
    };

    const autoFill = () => {
        if (!selectedAssignment) return;
        setSelectedAttendeeId(undefined);
        setCopyState("");
        setSendState("");
        setSentThreadUrl(undefined);
        resetPreviewText();
        setSlotAssignments(autoFillAssignmentSlots(selectedAssignment, sessionAttendees));
    };

    const clearSlots = () => {
        setSelectedAttendeeId(undefined);
        setCopyState("");
        setSendState("");
        setSentThreadUrl(undefined);
        resetPreviewText();
        setSlotAssignments({});
    };

    const assignAttendeeToSlot = (slotKey: string, attendeeId: string | undefined) => {
        setCopyState("");
        setSendState("");
        setSentThreadUrl(undefined);
        resetPreviewText();
        setSelectedAttendeeId(undefined);
        setSlotAssignments(prev => {
            const next: AssignmentSlotAssignments = {};
            Object.entries(prev).forEach(([key, value]) => {
                if (value != null && value !== attendeeId) {
                    next[key] = value;
                }
            });
            next[slotKey] = attendeeId;
            return next;
        });
    };

    const assignFromSelect = (slotKey: string, value: string) => {
        assignAttendeeToSlot(slotKey, value || undefined);
    };

    const assignFromDrag = (slotKey: string, value: string) => {
        if (!sessionAttendees.includes(value)) return;
        assignAttendeeToSlot(slotKey, value);
    };

    const handleSlotClick = (slotKey: string) => {
        if (selectedAttendeeId == null) return;
        assignAttendeeToSlot(slotKey, selectedAttendeeId);
    };

    const copyText = async () => {
        try {
            await navigator.clipboard.writeText(messageText);
            setCopyState("Copied");
        } catch (err) {
            onError(err instanceof Error ? err.message : "Copy failed");
        }
    };

    const sendAssignment = async () => {
        if (!selectedAssignment || !messageText.trim() || sending) return;

        setSending(true);
        setSendState(isEditMode ? "Saving..." : "Sending...");
        setSentThreadUrl(undefined);
        try {
            let response;
            if (isEditMode && fetchedAssignment) {
                response = await ApiUtils.updateSessionAssignment(token, mentee.id, session.id, selectedAssignment.id, messageText, JSON.stringify(slotAssignments));
                if (!response) {
                    setSendState("");
                    onError("Not authorized");
                    return;
                }
                setSendState("Saved");
                setFetchedAssignment(response);
                setPreviewText(response.content);
                setPreviewDirty(true);
                onAssignmentSaved();
            } else {
                response = await ApiUtils.sendMenteeSessionAssignment(token, mentee.id, session.id, selectedAssignment.id, messageText, JSON.stringify(slotAssignments));
                if (!response) {
                    setSendState("");
                    onError("Not authorized");
                    return;
                }
                setSendState("Sent");
                setSentThreadUrl(response.threadUrl);
                setFetchedAssignment(response);
                setPreviewText(response.content);
                setPreviewDirty(true);
                onAssignmentSaved();
            }
        } catch (err) {
            setSendState("");
            onError(err instanceof Error ? err.message : (isEditMode ? "Save failed" : "Send failed"));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className={styles.assignmentModalOverlay} role="presentation">
            <div className={styles.assignmentModal} role="dialog" aria-modal="true"
                 aria-labelledby="assignment-modal-title">
                <header className={styles.assignmentModalHeader}>
                    <div>
                        <h2 id="assignment-modal-title">{isEditMode ? "Edit Assignment" : "Assignment Generator"}</h2>
                        <p>{session.airport || "No airport"} - {formatAdminUtcDate(session.time, {showUtcSuffix: false})}</p>
                    </div>
                    <button type="button" onClick={onClose}>Close</button>
                </header>

                {sortedAssignments.length === 0 ? (
                    <p className={styles.emptyState}>No active assignments are available yet.</p>
                ) : (
                    <div className={styles.assignmentGeneratorStack}>
                        <section className={styles.assignmentGeneratorToolbar}>
                            <label>
                                <span>Assignment</span>
                                <select value={selectedAssignment?.id ?? 0}
                                        onChange={event => changeAssignment(Number(event.target.value))}>
                                    {sortedAssignments.map(assignment => (
                                        <option key={assignment.id} value={assignment.id}>
                                            {assignment.airport} - {assignment.title}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className={styles.assignmentToolbarActions}>
                                <button type="button" onClick={autoFill}>Auto-fill</button>
                                <button type="button" onClick={clearSlots}>Clear</button>
                            </div>
                        </section>

                        <section className={styles.assignmentBoard}>
                            <div className={styles.attendeeTray}>
                                <div className={styles.boardHeader}>
                                    <h3>Unassigned attendees</h3>
                                    <span>{unassignedAttendees.length}</span>
                                </div>
                                <div className={styles.attendeePool} aria-label="Unassigned session attendees">
                                    {unassignedAttendees.length === 0 ? (
                                        <span>All attendees assigned</span>
                                    ) : unassignedAttendees.map(attendeeId => (
                                        <button
                                            key={attendeeId}
                                            type="button"
                                            className={selectedAttendeeId === attendeeId ? styles.attendeeChipSelected : undefined}
                                            draggable
                                            onClick={() => setSelectedAttendeeId(prev => prev === attendeeId ? undefined : attendeeId)}
                                            onDragStart={event => event.dataTransfer.setData("text/plain", String(attendeeId))}
                                        >
                                            {getUserName(attendeeId)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.assignmentSlotBoard}>
                                {selectedAssignment?.groups.map((group, groupIndex) => (
                                    <article key={`${group.name}-${groupIndex}`} className={styles.assignmentSlotGroup}>
                                        <div className={styles.boardHeader}>
                                            <h3>{group.name}</h3>
                                            <span>{group.slots.length} slots</span>
                                        </div>
                                        <div className={styles.assignmentSlotRows}>
                                            {group.slots.map((slot, slotIndex) => {
                                                const slotKey = getAssignmentSlotKey(slot.id, `${groupIndex}-${slotIndex}`);
                                                const assignedAttendee = slotAssignments[slotKey];
                                                return (
                                                    <div
                                                        key={slotKey}
                                                        className={`${styles.assignmentSlotCard} ${selectedAttendeeId != null ? styles.assignmentSlotCardSelectable : ""}`}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => handleSlotClick(slotKey)}
                                                        onKeyDown={event => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                handleSlotClick(slotKey);
                                                            }
                                                        }}
                                                        onDragOver={event => event.preventDefault()}
                                                        onDrop={event => assignFromDrag(slotKey, event.dataTransfer.getData("text/plain"))}
                                                    >
                                                        <div className={styles.assignmentSlotText}>
                                                            <strong>{slot.label}</strong>
                                                            {slot.details ? <span>{slot.details}</span> : null}
                                                        </div>
                                                        <div className={styles.assignmentSlotAssignee}>
                                                            {assignedAttendee != null ? (
                                                                <button type="button" onClick={event => {
                                                                    event.stopPropagation();
                                                                    assignAttendeeToSlot(slotKey, undefined);
                                                                }}>
                                                                    {getUserName(assignedAttendee)} x
                                                                </button>
                                                            ) : (
                                                                <span>Drop or tap to assign</span>
                                                            )}
                                                            <select
                                                                value={assignedAttendee ?? ""}
                                                                onClick={event => event.stopPropagation()}
                                                                onChange={event => assignFromSelect(slotKey, event.target.value)}
                                                                aria-label={`Assign ${slot.label}`}
                                                            >
                                                                <option value="">Unassigned</option>
                                                                {sessionAttendees.map(attendeeId => (
                                                                    <option key={attendeeId}
                                                                            value={attendeeId}>{getUserName(attendeeId)}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>

                        <section className={styles.assignmentPreviewFold}>
                            <div className={styles.previewFoldHeader}>
                                <button type="button" onClick={() => setPreviewOpen(open => !open)}>
                                    {previewOpen ? "Hide Preview" : "Show Preview"}
                                </button>
                                <div className={styles.copyRow}>
                                    <span>{sendState || copyState}</span>
                                    <button type="button" onClick={copyText}>Copy Text</button>
                                    <button type="button" onClick={sendAssignment}
                                            disabled={!selectedAssignment || !messageText.trim() || sending}>
                                        {isEditMode ? "Save & Update" : "Send"}
                                    </button>
                                    {sentThreadUrl ? (
                                        <a href={sentThreadUrl} target="_blank" rel="noreferrer">Open Thread</a>
                                    ) : null}
                                </div>
                            </div>
                            {previewOpen ? (
                                <textarea
                                    value={messageText}
                                    onChange={event => {
                                        setPreviewText(event.target.value);
                                        setPreviewDirty(true);
                                        setCopyState("");
                                        setSendState("");
                                    }}
                                    rows={16}
                                />
                            ) : null}
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

const parseOptionalNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const sortSessionsAsc = (a: Session, b: Session) => new Date(a.time).getTime() - new Date(b.time).getTime();
const sortSessionsDesc = (a: Session, b: Session) => new Date(b.time).getTime() - new Date(a.time).getTime();

const formatPilotCount = (session: Session) => {
    if (!Number.isFinite(session.pilots) || session.pilots <= 0) {
        return String(session.attendees.length);
    }

    return `${session.attendees.length}/${session.pilots}`;
};

const getMenteeSessionCount = (mentee: AdminMentee, session: Session) => {
    const sessionTime = new Date(session.time).getTime();
    const pastRunningSessions = mentee.sessions.filter(candidate => {
        if (candidate.cancelled) return false;
        return new Date(candidate.time).getTime() < sessionTime;
    });

    return pastRunningSessions.length + 1;
};

const getAssignedMentorId = (mentee: AdminMentee) => mentee.practicalMentor ?? mentee.writtenMentor;

const getUserNameFromMap = (usersById: Map<string, AtcmhUser>, id: string) => {
    const user = usersById.get(id);
    return user ? user.username : `User (${id})`;
};

export default AdminMentees;
