import {type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState} from "react";
import {useLocation, useNavigate, useParams, useSearchParams} from "@/src/dashboard/next-navigation";
import type {AdminMentee} from "../../types/AdminMentee.ts";
import type {AutoMatchCandidate, AutoMatchLeniency, WaitlistHelperPreferences} from "../../types/AutoMatchCandidate.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import type {Session} from "../../types/Session.ts";
import type {UserNote} from "../../types/UserNote.ts";
import type {AdminAssignment, AssignmentSlotAssignments} from "../../types/AdminAssignment.ts";
import type {SessionAssignment} from "../../types/SessionAssignment.ts";
import {usePagination, type PaginationResult} from "../../hooks/usePagination.ts";
import {
    formatAdminUtcDate,
    formatIfcDisplay,
    generateHalfHourUtcDateTimeSuggestions,
    parseUtcDateTimeInput,
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
import WeeklyAvailabilityEditor from "../../../apply/WeeklyAvailabilityEditor.tsx";
import {defaultWeeklyAvailabilityAnswer} from "../../../apply/weekly-availability.ts";
import styles from "./AdminMentees.module.css";

interface AdminMenteesProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    accountId: string | undefined;
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

type MentorFilter = "all" | "mine" | "waitlist";
type MenteeView = "cards" | "table";
type MenteeStateAction = "pickup" | "pass";
const MENTOR_FILTER_PARAM = "mentorFilter";
const MENTEE_SEARCH_PARAM = "search";
const MENTEE_VIEW_PARAM = "view";
const AVAILABILITY_ENTRY_SEPARATOR = /\n+|(?=\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday):)/;

type MenteeActionPolicy = ReturnType<typeof getMenteeActionPolicy>;
type SessionFormState = {mentorId: string; airport: string; pilots: string; time: string};

const normalizeMenteeView = (value: string | null): MenteeView => value === "table" ? "table" : "cards";

const normalizeMentorFilter = (value: string | null): MentorFilter => {
    return value === "mine" || value === "waitlist" ? value : "all";
};

const stateActionCopy: Record<MenteeStateAction, { title: string; description: string; confirmLabel: string }> = {
    pickup: {
        title: "Pick up this mentee?",
        description: "This assigns the mentee to you and moves them out of the waitlist. Continue?",
        confirmLabel: "Confirm pickup",
    },
    pass: {
        title: "Pass this mentee?",
        description: "This marks the mentee as passed and ends the active mentorship. Continue?",
        confirmLabel: "Confirm pass",
    },
};

const AdminMentees = ({
                          loaded,
                          loggedIn,
                          error,
                          accountId,
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
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const {menteeRecordId} = useParams();
    const [actionError, setActionError] = useState<string | undefined>();
    const [busyAction, setBusyAction] = useState<string | undefined>();
    const [showTerminateModal, setShowTerminateModal] = useState(false);
    const [pendingStateAction, setPendingStateAction] = useState<MenteeStateAction>();
    const [terminateReason, setTerminateReason] = useState("");
    const [sessionForm, setSessionForm] = useState<SessionFormState>({mentorId: "", airport: "", pilots: "1", time: ""});
    const [autoMatchAvailability, setAutoMatchAvailability] = useState(defaultWeeklyAvailabilityAnswer);
    const [autoMatchLeniency, setAutoMatchLeniency] = useState<AutoMatchLeniency>("medium");
    const [autoMatchCandidates, setAutoMatchCandidates] = useState<AutoMatchCandidate[]>([]);
    const [autoMatchSearched, setAutoMatchSearched] = useState(false);
    const [autoMatchError, setAutoMatchError] = useState<string | undefined>();
    const [autoMatchOpen, setAutoMatchOpen] = useState(false);
    const [autoMatchPreferencesLoadedFor, setAutoMatchPreferencesLoadedFor] = useState<string>();
    const autoMatchSaveQueue = useRef<Promise<unknown>>(Promise.resolve());
    const [attendeeInputs, setAttendeeInputs] = useState<Record<string, string>>({});
    const [assignmentSession, setAssignmentSession] = useState<{
        session: Session;
        existingAssignment?: SessionAssignment
    } | undefined>();

    const filter = searchParams.get(MENTEE_SEARCH_PARAM) ?? "";
    const view = normalizeMenteeView(searchParams.get(MENTEE_VIEW_PARAM));
    const requestedMentorFilter = normalizeMentorFilter(searchParams.get(MENTOR_FILTER_PARAM));
    const mentorFilter: MentorFilter = requestedMentorFilter === "mine" && !adminUser ? "all" : requestedMentorFilter;
    const preferenceAccountId = accountId ?? adminUser?.id;
    const usersById = useMemo(() => new Map(users?.map(user => [user.id, user]) ?? []), [users]);
    const autoMatchCandidateIds = useMemo(
        () => new Set(autoMatchCandidates.map(candidate => candidate.id)),
        [autoMatchCandidates],
    );

    const selectedMentee = useMemo(() => {
        if (!mentees || !menteeRecordId) return undefined;
        return mentees.find(mentee => String(mentee.id) === menteeRecordId);
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
            if (mentorFilter === "waitlist" && autoMatchSearched && !autoMatchCandidateIds.has(mentee.id)) {
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
    }, [adminUser, autoMatchCandidateIds, autoMatchSearched, filter, mentees, mentorFilter, usersById]);

    const menteePagination = usePagination(displayedMentees, 50);

    const menteeRoute = (id?: number) => {
        const path = id == null ? "/dashboard/mentees" : `/dashboard/mentees/${id}`;
        const query = searchParams.toString();
        return query ? `${path}?${query}` : path;
    };

    const updateListQuery = (updates: {search?: string; mentorFilter?: MentorFilter; view?: MenteeView}) => {
        const nextParams = new URLSearchParams(searchParams.toString());
        if (updates.search !== undefined) {
            if (updates.search.trim()) nextParams.set(MENTEE_SEARCH_PARAM, updates.search);
            else nextParams.delete(MENTEE_SEARCH_PARAM);
        }
        if (updates.mentorFilter !== undefined) {
            if (updates.mentorFilter === "all") nextParams.delete(MENTOR_FILTER_PARAM);
            else nextParams.set(MENTOR_FILTER_PARAM, updates.mentorFilter);
        }
        if (updates.view !== undefined) nextParams.set(MENTEE_VIEW_PARAM, updates.view);
        const query = nextParams.toString();
        navigate(`${location.pathname}${query ? `?${query}` : ""}`, {replace: true});
    };

    const handleMenteeSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
        menteePagination.reset();
        updateListQuery({search: event.target.value});
    };

    const handleMentorFilterChange = (value: string) => {
        const nextFilter = normalizeMentorFilter(value);
        menteePagination.reset();
        updateListQuery({mentorFilter: nextFilter});
    };

    useEffect(() => {
        let current = true;
        setAutoMatchPreferencesLoadedFor(undefined);
        setAutoMatchAvailability(defaultWeeklyAvailabilityAnswer);
        setAutoMatchLeniency("medium");
        setAutoMatchCandidates([]);
        setAutoMatchSearched(false);
        setAutoMatchError(undefined);

        if (!loggedIn || !token || !preferenceAccountId) {
            return () => {
                current = false;
            };
        }

        void ApiUtils.getWaitlistHelperPreferences(token)
            .then(preferences => {
                if (!current) return;
                if (preferences) {
                    setAutoMatchAvailability(preferences.availability);
                    setAutoMatchLeniency(preferences.leniency);
                }
                setAutoMatchPreferencesLoadedFor(preferenceAccountId);
            })
            .catch(reason => {
                if (!current) return;
                setAutoMatchPreferencesLoadedFor(preferenceAccountId);
                setAutoMatchError(`Could not load your waitlist helper settings: ${reason instanceof Error ? reason.message : String(reason)}`);
            });

        return () => {
            current = false;
        };
    }, [loggedIn, preferenceAccountId, token]);

    useEffect(() => {
        if (!loggedIn || !token || !preferenceAccountId || autoMatchPreferencesLoadedFor !== preferenceAccountId) return;

        let current = true;
        const preferences: WaitlistHelperPreferences = {
            availability: autoMatchAvailability,
            leniency: autoMatchLeniency,
        };
        const timer = window.setTimeout(() => {
            autoMatchSaveQueue.current = autoMatchSaveQueue.current
                .catch(() => undefined)
                .then(() => ApiUtils.saveWaitlistHelperPreferences(token, preferences))
                .catch(reason => {
                    if (current) {
                        setAutoMatchError(`Could not save your waitlist helper settings: ${reason instanceof Error ? reason.message : String(reason)}`);
                    }
                });
        }, 350);

        return () => {
            current = false;
            window.clearTimeout(timer);
        };
    }, [autoMatchAvailability, autoMatchLeniency, autoMatchPreferencesLoadedFor, loggedIn, preferenceAccountId, token]);

    const handleAutoMatchSearch = async (event: FormEvent) => {
        event.preventDefault();
        setAutoMatchError(undefined);

        try {
            setBusyAction("auto-match-search");
            const candidates = await ApiUtils.getAutoMatchCandidates(token, autoMatchAvailability, autoMatchLeniency);
            setAutoMatchCandidates(candidates ?? []);
            setAutoMatchSearched(true);
            menteePagination.reset();
        } catch (err) {
            setAutoMatchError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusyAction(undefined);
        }
    };

    const clearMenteeFilters = () => {
        menteePagination.reset();
        updateListQuery({search: "", mentorFilter: "all"});
    };

    const handleViewChange = (nextView: MenteeView) => updateListQuery({view: nextView});

    useEffect(() => {
        if (mentorFilter !== "waitlist") {
            setAutoMatchCandidates([]);
            setAutoMatchSearched(false);
            setAutoMatchError(undefined);
            setAutoMatchOpen(false);
        } else {
            setAutoMatchOpen(true);
        }
    }, [mentorFilter]);

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

    const requestPickup = () => {
        if (!selectedMentee) return;
        if (!selectedActionPolicy?.canPickup) return;
        if (selectedMenteeHasMentor) {
            setActionError("This mentee already has a mentor.");
            return;
        }
        setPendingStateAction("pickup");
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

    const requestPass = () => {
        if (!selectedMentee || !selectedActionPolicy?.canPass) return;
        setPendingStateAction("pass");
    };

    const handleStateActionConfirm = () => {
        if (!selectedMentee || !pendingStateAction) return;
        const action = pendingStateAction;
        const allowed = action === "pickup" ? selectedActionPolicy?.canPickup : selectedActionPolicy?.canPass;
        if (!allowed) {
            setPendingStateAction(undefined);
            return;
        }

        setPendingStateAction(undefined);
        void runAction(
            action,
            () => action === "pickup"
                ? ApiUtils.pickupMentee(token, selectedMentee.id)
                : ApiUtils.passMentee(token, selectedMentee.id),
            onMenteeChanged,
        );
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
            {menteeRecordId ? (
                <MenteeProfilePage
                    selectedMentee={selectedMentee}
                    getUserName={getUserName}
                    onBack={() => navigate(menteeRoute())}
                    actionError={actionError}
                    onDismissActionError={() => setActionError(undefined)}
                    selectedActionPolicy={selectedActionPolicy}
                    busyAction={busyAction}
                    onPickup={requestPickup}
                    onTerminate={handleTerminateClick}
                    onPass={requestPass}
                    selectedSessions={selectedSessions}
                    attendedSessions={attendedSessions}
                    selectedMenteeNotes={selectedMenteeNotes}
                    sessionForm={sessionForm}
                    onSessionFormChange={changes => setSessionForm(prev => ({...prev, ...changes}))}
                    sessionTimeSuggestions={sessionTimeSuggestions}
                    onSchedule={handleSchedule}
                    attendeeInputs={attendeeInputs}
                    assignments={assignments}
                    onAttendeeInputChange={(sessionId, value) => setAttendeeInputs(prev => ({...prev, [sessionId]: value}))}
                    onUpdateSession={handleUpdateSession}
                    onAddAttendee={handleAddAttendee}
                    onRemoveAttendee={handleRemoveAttendee}
                    onCancelSession={handleCancelSession}
                    onOpenAssignmentGenerator={(session, existingAssignment) => setAssignmentSession({session, existingAssignment})}
                />
            ) : (
                <MenteeListPage
                    pagination={menteePagination}
                    filter={filter}
                    mentorFilter={mentorFilter}
                    view={view}
                    adminUser={adminUser}
                    getUserName={getUserName}
                    onSearchChange={handleMenteeSearchChange}
                    onMentorFilterChange={handleMentorFilterChange}
                    onViewChange={handleViewChange}
                    onClearFilters={clearMenteeFilters}
                    onOpenMentee={id => navigate(menteeRoute(id))}
                    autoMatchOpen={autoMatchOpen}
                    onAutoMatchToggleOpen={() => setAutoMatchOpen(open => !open)}
                    autoMatchCandidates={autoMatchCandidates}
                    autoMatchAvailability={autoMatchAvailability}
                    autoMatchLeniency={autoMatchLeniency}
                    autoMatchSearched={autoMatchSearched}
                    autoMatchBusy={busyAction === "auto-match-search"}
                    autoMatchError={autoMatchError}
                    onAutoMatchAvailabilityChange={setAutoMatchAvailability}
                    onAutoMatchLeniencyChange={value => setAutoMatchLeniency(value)}
                    onAutoMatchSearch={handleAutoMatchSearch}
                />
            )}

            {pendingStateAction ? (
                <MenteeActionConfirmation
                    action={pendingStateAction}
                    onCancel={() => setPendingStateAction(undefined)}
                    onConfirm={handleStateActionConfirm}
                />
            ) : null}

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
                                <button type="submit" disabled={busyAction === "terminate"}>Confirm Terminate</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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

interface MenteeListPageProps {
    pagination: PaginationResult<AdminMentee>;
    filter: string;
    mentorFilter: MentorFilter;
    view: MenteeView;
    adminUser: AdminUser | undefined;
    getUserName: (id?: string) => string;
    onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onMentorFilterChange: (value: string) => void;
    onViewChange: (view: MenteeView) => void;
    onClearFilters: () => void;
    onOpenMentee: (id: number) => void;
    autoMatchOpen: boolean;
    onAutoMatchToggleOpen: () => void;
    autoMatchCandidates: AutoMatchCandidate[];
    autoMatchAvailability: string;
    autoMatchLeniency: AutoMatchLeniency;
    autoMatchSearched: boolean;
    autoMatchBusy: boolean;
    autoMatchError: string | undefined;
    onAutoMatchAvailabilityChange: (value: string) => void;
    onAutoMatchLeniencyChange: (value: AutoMatchLeniency) => void;
    onAutoMatchSearch: (event: FormEvent) => void;
}

const MenteeListPage = ({
                            pagination,
                            filter,
                            mentorFilter,
                            view,
                            adminUser,
                            getUserName,
                            onSearchChange,
                            onMentorFilterChange,
                            onViewChange,
                            onClearFilters,
                            onOpenMentee,
                            autoMatchOpen,
                            onAutoMatchToggleOpen,
                            autoMatchCandidates,
                            autoMatchAvailability,
                            autoMatchLeniency,
                            autoMatchSearched,
                            autoMatchBusy,
                            autoMatchError,
                            onAutoMatchAvailabilityChange,
                            onAutoMatchLeniencyChange,
                            onAutoMatchSearch,
                        }: MenteeListPageProps) => {
    const hasFilters = Boolean(filter.trim()) || mentorFilter !== "all";
    const autoMatchCandidateById = useMemo(
        () => new Map(autoMatchCandidates.map(candidate => [candidate.id, candidate])),
        [autoMatchCandidates],
    );
    const autoMatchActive = mentorFilter === "waitlist" && autoMatchSearched;
    return (
        <main className={styles.menteesListPage} aria-label="Mentees">
            <section className={styles.menteesToolbar} aria-label="Mentee filters and view options">
                <div className={styles.filterField}>
                    <div className={styles.filterFieldHeader}>
                        <label className={styles.filterFieldLabel} htmlFor="mentee-search">Search</label>
                        <div className={styles.filterFieldMeta}>
                            <span>{pagination.totalItems} matching {pagination.totalItems === 1 ? "record" : "records"}</span>
                            {hasFilters ? (
                                <button type="button" className={styles.clearFiltersButton} onClick={onClearFilters}>Clear filters</button>
                            ) : null}
                        </div>
                    </div>
                    <div className={`${styles.searchInputRow} ${mentorFilter === "waitlist" ? styles.searchInputRowWithToggle : ""}`}>
                        <input
                            id="mentee-search"
                            value={filter}
                            onChange={onSearchChange}
                            placeholder="Name, Discord ID, IFC, recruiter..."
                        />
                        {mentorFilter === "waitlist" ? (
                            <button
                                type="button"
                                className={styles.autoMatchToggleButton}
                                aria-controls="auto-match-panel"
                                aria-expanded={autoMatchOpen}
                                onClick={onAutoMatchToggleOpen}
                            >
                                <span>{autoMatchOpen ? "Hide helper" : "Match helper"}</span>
                                {autoMatchSearched ? <span className={styles.autoMatchToggleCount}>{autoMatchCandidates.length}</span> : null}
                            </button>
                        ) : null}
                    </div>
                </div>
                <label className={styles.filterField} htmlFor="mentor-filter">
                    <span>Mentor</span>
                    <select id="mentor-filter" value={mentorFilter} onChange={event => onMentorFilterChange(event.target.value)}>
                        <option value="all">All mentees</option>
                        <option value="mine" disabled={!adminUser}>My mentees</option>
                        <option value="waitlist">Unassigned waitlist</option>
                    </select>
                </label>
                <div className={styles.viewSwitcher} role="group" aria-label="Mentee list view">
                    <button type="button" aria-pressed={view === "cards"} className={view === "cards" ? styles.viewButtonActive : undefined} onClick={() => onViewChange("cards")}>Cards</button>
                    <button type="button" aria-pressed={view === "table"} className={view === "table" ? styles.viewButtonActive : undefined} onClick={() => onViewChange("table")}>Table</button>
                </div>
            </section>

            {mentorFilter === "waitlist" && autoMatchOpen ? (
                <AutoMatchPanel
                    candidates={autoMatchCandidates}
                    availability={autoMatchAvailability}
                    leniency={autoMatchLeniency}
                    searched={autoMatchSearched}
                    busy={autoMatchBusy}
                    error={autoMatchError}
                    onAvailabilityChange={onAutoMatchAvailabilityChange}
                    onLeniencyChange={onAutoMatchLeniencyChange}
                    onSearch={onAutoMatchSearch}
                />
            ) : null}

            {pagination.paginatedItems.length > 0 ? (
                view === "cards" ? (
                    <div className={styles.menteesCardGrid} aria-label="Mentees in card view">
                        {pagination.paginatedItems.map(mentee => (
                            <MenteeCard
                                key={mentee.id}
                                mentee={mentee}
                                getUserName={getUserName}
                                onOpen={onOpenMentee}
                                match={autoMatchActive ? autoMatchCandidateById.get(mentee.id) : undefined}
                            />
                        ))}
                    </div>
                ) : (
                    <MenteeTable
                        mentees={pagination.paginatedItems}
                        getUserName={getUserName}
                        onOpen={onOpenMentee}
                        autoMatchActive={autoMatchActive}
                        candidateById={autoMatchCandidateById}
                    />
                )
            ) : (
                <div className={styles.menteesEmptyState}>
                    <h3>No mentees match these filters</h3>
                    <p>Try a broader search or clear the filters to see the full queue.</p>
                    <button type="button" className={styles.clearFiltersButton} onClick={onClearFilters}>Clear filters</button>
                </div>
            )}

            <AdminPagination
                {...pagination}
                totalItems={pagination.totalItems}
                className={styles.menteesPagination}
            />
        </main>
    );
};

interface AutoMatchPanelProps {
    candidates: AutoMatchCandidate[];
    availability: string;
    leniency: AutoMatchLeniency;
    searched: boolean;
    busy: boolean;
    error: string | undefined;
    onAvailabilityChange: (value: string) => void;
    onLeniencyChange: (value: AutoMatchLeniency) => void;
    onSearch: (event: FormEvent) => void;
}

const AutoMatchPanel = ({
                            candidates,
                            availability,
                            leniency,
                            searched,
                            busy,
                            error,
                            onAvailabilityChange,
                            onLeniencyChange,
                            onSearch,
                        }: AutoMatchPanelProps) => (
    <section id="auto-match-panel" className={styles.autoMatchPanel} aria-labelledby="auto-match-title">
        <div className={styles.autoMatchHeader}>
            <div>
                <p className={styles.autoMatchEyebrow}>Waitlist helper</p>
                <h2 id="auto-match-title">Auto-match by weekly UTC availability</h2>
                <p>Set when you are available on each weekday, then find waitlisted mentees whose profile matches your schedule.</p>
            </div>
            <span className={styles.autoMatchCount}>{candidates.length} {candidates.length === 1 ? "match" : "matches"}</span>
        </div>

        <form className={styles.autoMatchForm} onSubmit={onSearch}>
            <div>
                <p className={styles.autoMatchHint}>Times are in UTC. Turn on each day you are available, then choose a start and end time.</p>
                <WeeklyAvailabilityEditor id="mentor-weekly-availability" value={availability} onChange={onAvailabilityChange}/>
            </div>
            <div className={styles.autoMatchActions}>
                <label>
                    <span>Match leniency</span>
                    <select value={leniency} onChange={event => onLeniencyChange(event.target.value as AutoMatchLeniency)}>
                        <option value="strict">Strict · overlap only</option>
                        <option value="medium">Medium · up to 30 min gap</option>
                        <option value="very-loose">Very loose · up to 2 hr gap</option>
                    </select>
                </label>
                <button type="submit" disabled={busy}>{busy ? "Finding…" : "Find matches"}</button>
            </div>
        </form>

        {error ? <p className={styles.autoMatchError} role="alert">{error}</p> : null}
        {searched ? <p className={styles.autoMatchResultHint} role="status">Matches now filter the main cards or table below.</p> : null}
    </section>
);

interface MenteeCardProps {
    mentee: AdminMentee;
    getUserName: (id?: string) => string;
    onOpen: (id: number) => void;
    match?: AutoMatchCandidate;
}

const MenteeCard = ({mentee, getUserName, onOpen, match}: MenteeCardProps) => (
    <article className={styles.menteeCard}>
        {match ? (
            <div className={styles.menteeCardMatchBar}>
                <span>{formatAutoMatchSummary(match)}</span>
                <span>{match.timezone || "Timezone not provided"}</span>
            </div>
        ) : null}
        <button type="button" className={styles.menteeCardOpen} onClick={() => onOpen(mentee.id)}>
            <span className={styles.menteeCardHeader}>
                <span>
                    <strong>{getUserName(mentee.mentee)}</strong>
                    <small>Record #{mentee.id}</small>
                </span>
                <span className={`${styles.stateBadge} ${styles[`${mentee.state}Badge`]}`}>{stateLabels[mentee.state]}</span>
            </span>
            <span className={styles.menteeCardDetails}>
                <span><small>Mentor</small><strong>{getMentorDisplayName(mentee, getUserName)}</strong></span>
                <span><small>Recruiter</small><strong>{mentee.recruiter || "Not set"}</strong></span>
                <span><small>IFC</small><strong>{formatIfcDisplay(mentee)}</strong></span>
                <span><small>Sessions</small><strong>{mentee.sessions.length}</strong></span>
            </span>
            <span className={styles.menteeCardFooter}>
                <span>Joined {formatAdminUtcDate(mentee.waitlistTime)}</span>
                <span>Open profile</span>
            </span>
        </button>
    </article>
);

interface MenteeTableProps {
    mentees: AdminMentee[];
    getUserName: (id?: string) => string;
    onOpen: (id: number) => void;
    autoMatchActive: boolean;
    candidateById: Map<number, AutoMatchCandidate>;
}

const MenteeTable = ({mentees, getUserName, onOpen, autoMatchActive, candidateById}: MenteeTableProps) => (
    <div className={styles.menteesTableWrap}>
        <table className={styles.menteesTable}>
            <caption className={styles.visuallyHidden}>Mentee records</caption>
            <thead>
            <tr>
                <th scope="col">Mentee</th>
                <th scope="col">Status</th>
                <th scope="col">Mentor</th>
                <th scope="col">Recruiter</th>
                <th scope="col">IFC</th>
                <th scope="col">Sessions</th>
                <th scope="col"><span className={styles.visuallyHidden}>Profile</span></th>
            </tr>
            </thead>
            <tbody>
            {mentees.map(mentee => (
                <tr key={mentee.id}>
                    <th scope="row">
                        <div className={styles.tableMenteeIdentity}>
                            <button type="button" className={styles.tableMenteeButton} onClick={() => onOpen(mentee.id)}>
                                <strong>{getUserName(mentee.mentee)}</strong>
                                <small>#{mentee.id} · {formatAdminUtcDate(mentee.waitlistTime)}</small>
                            </button>
                            {autoMatchActive && candidateById.get(mentee.id) ? (
                                <small className={styles.tableMatchSummary}>
                                    {formatAutoMatchSummary(candidateById.get(mentee.id)!)} · {candidateById.get(mentee.id)?.timezone || "Timezone not provided"}
                                </small>
                            ) : null}
                        </div>
                    </th>
                    <td><span className={`${styles.stateBadge} ${styles[`${mentee.state}Badge`]}`}>{stateLabels[mentee.state]}</span></td>
                    <td>{getMentorDisplayName(mentee, getUserName)}</td>
                    <td>{mentee.recruiter || "Not set"}</td>
                    <td>{formatIfcDisplay(mentee)}</td>
                    <td>{mentee.sessions.length}</td>
                    <td><button type="button" className={styles.tableOpenButton} onClick={() => onOpen(mentee.id)}>Open</button></td>
                </tr>
            ))}
            </tbody>
        </table>
    </div>
);

interface MenteeProfilePageProps {
    selectedMentee: AdminMentee | undefined;
    getUserName: (id?: string) => string;
    onBack: () => void;
    actionError: string | undefined;
    onDismissActionError: () => void;
    selectedActionPolicy: MenteeActionPolicy | undefined;
    busyAction: string | undefined;
    onPickup: () => void;
    onTerminate: () => void;
    onPass: () => void;
    selectedSessions: {future: Session[]; past: Session[]};
    attendedSessions: Session[];
    selectedMenteeNotes: UserNote[];
    sessionForm: SessionFormState;
    onSessionFormChange: (changes: Partial<SessionFormState>) => void;
    sessionTimeSuggestions: string[];
    onSchedule: (event: FormEvent) => void;
    attendeeInputs: Record<string, string>;
    assignments: AdminAssignment[];
    onAttendeeInputChange: (sessionId: number, value: string) => void;
    onUpdateSession: (sessionId: number, form: SessionEditForm) => Promise<Session | undefined>;
    onAddAttendee: (event: FormEvent, sessionId: number) => Promise<Session | undefined>;
    onRemoveAttendee: (sessionId: number, attendeeId: string) => Promise<Session | undefined>;
    onCancelSession: (sessionId: number) => Promise<Session | undefined>;
    onOpenAssignmentGenerator: (session: Session, existingAssignment?: SessionAssignment) => void;
}

const MenteeProfilePage = ({
                              selectedMentee,
                              getUserName,
                              onBack,
                              actionError,
                              onDismissActionError,
                              selectedActionPolicy,
                              busyAction,
                              onPickup,
                              onTerminate,
                              onPass,
                              selectedSessions,
                              attendedSessions,
                              selectedMenteeNotes,
                              sessionForm,
                              onSessionFormChange,
                              sessionTimeSuggestions,
                              onSchedule,
                              attendeeInputs,
                              assignments,
                              onAttendeeInputChange,
                              onUpdateSession,
                              onAddAttendee,
                              onRemoveAttendee,
                              onCancelSession,
                              onOpenAssignmentGenerator,
                          }: MenteeProfilePageProps) => {
    if (!selectedMentee) {
        return (
            <main className={styles.profileNotFound}>
                <button type="button" className={styles.profileBackButton} onClick={onBack}>Back to mentees</button>
                <h2>Mentee not found</h2>
                <p>This mentee record may have been removed or you may not have access to it.</p>
            </main>
        );
    }

    return (
        <main className={styles.profilePage} aria-labelledby="mentee-profile-title">
            <div className={styles.profileBreadcrumb}>
                <button type="button" className={styles.profileBackButton} onClick={onBack}>Back to mentees</button>
                <span aria-hidden="true">/</span>
                <span>Mentee profile</span>
            </div>
            <header className={styles.profileHeader}>
                <div className={styles.profileIdentity}>
                    <div className={styles.profileTitleRow}>
                        <h2 id="mentee-profile-title">{getUserName(selectedMentee.mentee)}</h2>
                        <span className={`${styles.stateBadge} ${styles[`${selectedMentee.state}Badge`]}`}>{stateLabels[selectedMentee.state]}</span>
                    </div>
                    <p>Record #{selectedMentee.id} · {formatIfcDisplay(selectedMentee)}</p>
                </div>
                <div className={styles.profileActionButtons}>
                    {selectedActionPolicy?.canPickup ? <button type="button" onClick={onPickup} disabled={busyAction === "pickup"}>Pick up</button> : null}
                    {selectedActionPolicy?.canTerminate ? <button type="button" className={styles.dangerStateAction} onClick={onTerminate} disabled={busyAction === "terminate"}>Terminate</button> : null}
                    {selectedActionPolicy?.canPass ? <button type="button" onClick={onPass} disabled={busyAction === "pass"}>Pass</button> : null}
                </div>
            </header>

            <AdminToast message={actionError} onDismiss={onDismissActionError}/>

            <section className={styles.profileSection} aria-label="Profile & timeline">
                <div className={styles.sectionHeading}>
                    <div><h3>Profile &amp; timeline</h3><p>Key ownership and lifecycle details for this mentorship record.</p></div>
                </div>
                <div className={styles.detailGrid}>
                    <DetailItem label="Waitlist time" value={formatAdminUtcDate(selectedMentee.waitlistTime)}/>
                    <DetailItem label="Pickup time" value={formatAdminUtcDate(selectedMentee.pickupTime)}/>
                    <DetailItem label="Pass time" value={formatAdminUtcDate(selectedMentee.passedTime)}/>
                    <DetailItem label="Termination time" value={formatAdminUtcDate(selectedMentee.terminatedTime)}/>
                    <DetailItem label="Mentor" value={getMentorDisplayName(selectedMentee, getUserName)}/>
                    <DetailItem label="Recruiter" value={selectedMentee.recruiter || "Not set"}/>
                    <DetailItem label="Timezone" value={selectedMentee.timezone || "Not provided"}/>
                    <DetailItem label="IFC" value={formatIfcDisplay(selectedMentee)}/>
                    <WeeklyAvailabilityDetail value={selectedMentee.availability}/>
                    {selectedMentee.terminationReason ? <DetailItem label="Termination reason" value={selectedMentee.terminationReason}/> : null}
                </div>
            </section>

            {selectedActionPolicy?.canSchedule ? (
                <section className={styles.actionsGrid} aria-label="Mentee actions">
                    <form className={styles.actionPanel} onSubmit={onSchedule}>
                        <h3>Schedule session</h3>
                        <p className={styles.actionPanelDescription}>Create the next practical session for this mentee.</p>
                        <input value={sessionForm.mentorId} onChange={event => onSessionFormChange({mentorId: event.target.value})} placeholder="Mentor Discord ID (blank for you)"/>
                        <div className={styles.inlineInputs}>
                            <input value={sessionForm.airport} onChange={event => onSessionFormChange({airport: event.target.value.toUpperCase()})} placeholder="Airport" maxLength={5} required/>
                            <input type="number" min="1" max="99" value={sessionForm.pilots} onChange={event => onSessionFormChange({pilots: event.target.value})} required/>
                        </div>
                        <label className={styles.utcDateTimeLabel}>
                            <span>Session time</span>
                            <input type="datetime-local" list="session-time-suggestions" value={sessionForm.time} onChange={event => onSessionFormChange({time: event.target.value})} required/>
                            <datalist id="session-time-suggestions">{sessionTimeSuggestions.map(value => <option key={value} value={value}/>)}</datalist>
                        </label>
                        <button type="submit" disabled={busyAction === "schedule"}>Schedule session</button>
                    </form>
                </section>
            ) : null}

            <UserNotesSection notes={selectedMenteeNotes} getUserName={getUserName}/>
            <SessionSection
                title="Future Sessions"
                sessions={selectedSessions.future}
                getUserName={getUserName}
                editable
                busyAction={busyAction}
                attendeeInputs={attendeeInputs}
                assignments={assignments}
                sessionTimeSuggestions={sessionTimeSuggestions}
                onAttendeeInputChange={onAttendeeInputChange}
                onUpdateSession={onUpdateSession}
                onAddAttendee={onAddAttendee}
                onRemoveAttendee={onRemoveAttendee}
                onCancelSession={onCancelSession}
                onOpenAssignmentGenerator={onOpenAssignmentGenerator}
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
                onAttendeeInputChange={onAttendeeInputChange}
                onUpdateSession={onUpdateSession}
                onAddAttendee={onAddAttendee}
                onRemoveAttendee={onRemoveAttendee}
                onCancelSession={onCancelSession}
                onOpenAssignmentGenerator={onOpenAssignmentGenerator}
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
                onAttendeeInputChange={onAttendeeInputChange}
                onUpdateSession={onUpdateSession}
                onAddAttendee={onAddAttendee}
                onRemoveAttendee={onRemoveAttendee}
                onCancelSession={onCancelSession}
                onOpenAssignmentGenerator={onOpenAssignmentGenerator}
            />
        </main>
    );
};

const MenteeActionConfirmation = ({
                                    action,
                                    onCancel,
                                    onConfirm,
                                }: {
    action: MenteeStateAction;
    onCancel: () => void;
    onConfirm: () => void;
}) => {
    const copy = stateActionCopy[action];
    return (
        <div className={styles.modalBackdrop} role="presentation" onClick={onCancel} onKeyDown={event => {
            if (event.key === "Escape") onCancel();
        }}>
            <div
                className={styles.confirmationModal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="mentee-action-confirmation-title"
                aria-describedby="mentee-action-confirmation-description"
                onClick={event => event.stopPropagation()}
            >
                <h3 id="mentee-action-confirmation-title">{copy.title}</h3>
                <p id="mentee-action-confirmation-description">{copy.description}</p>
                <div className={styles.modalActions}>
                    <button type="button" className={styles.secondaryButton} onClick={onCancel}>Cancel</button>
                    <button
                        type="button"
                        className={action === "pass" ? styles.dangerButton : undefined}
                        onClick={onConfirm}
                    >
                        {copy.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

const DetailItem = ({label, value}: { label: string; value: string }) => (
    <div className={styles.detailItem}>
        <span>{label}</span>
        <strong>{value}</strong>
    </div>
);

const WeeklyAvailabilityDetail = ({value}: {value?: string | null}) => {
    const entries = value?.trim()
        ? value.replace(/\r\n?/g, "\n").trim().split(AVAILABILITY_ENTRY_SEPARATOR).map(entry => {
            const separatorIndex = entry.indexOf(":");
            return separatorIndex < 0
                ? {day: "", time: entry.trim()}
                : {day: entry.slice(0, separatorIndex).trim(), time: entry.slice(separatorIndex + 1).trim()};
        })
        : [];

    return (
        <div className={`${styles.detailItem} ${styles.availabilityDetail}`}>
            <span>Weekly availability (UTC)</span>
            {entries.length > 0 ? (
                <dl className={styles.availabilityList}>
                    {entries.map(({day, time}, index) => (
                        <div key={`${day}-${index}`}>
                            {day ? <dt>{day}</dt> : null}
                            <dd>{time}</dd>
                        </div>
                    ))}
                </dl>
            ) : <strong>Not provided</strong>}
        </div>
    );
};

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

const formatAutoMatchSummary = (candidate: AutoMatchCandidate) => {
    return candidate.overlaps ? "Overlaps availability" : `${candidate.distanceMinutes} min gap`;
};

const getAssignedMentorId = (mentee: AdminMentee) => mentee.practicalMentor ?? mentee.writtenMentor;

const getMentorDisplayName = (mentee: AdminMentee, getUserName: (id?: string) => string) => {
    const mentorId = getAssignedMentorId(mentee);
    return mentorId ? getUserName(mentorId) : "None";
};

const getUserNameFromMap = (usersById: Map<string, AtcmhUser>, id: string) => {
    const user = usersById.get(id);
    return user ? user.username : `User (${id})`;
};

export default AdminMentees;
