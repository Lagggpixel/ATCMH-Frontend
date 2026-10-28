import {memo, startTransition, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState} from "react";
import {ArrowLeftIcon as ArrowLeft} from "@phosphor-icons/react/ArrowLeft";
import {CalendarBlankIcon as CalendarBlank} from "@phosphor-icons/react/CalendarBlank";
import {CaretDownIcon as CaretDown} from "@phosphor-icons/react/CaretDown";
import {CaretRightIcon as CaretRight} from "@phosphor-icons/react/CaretRight";
import {CaretUpIcon as CaretUp} from "@phosphor-icons/react/CaretUp";
import {CaretUpDownIcon as CaretUpDown} from "@phosphor-icons/react/CaretUpDown";
import {CheckIcon as Check} from "@phosphor-icons/react/Check";
import {CheckCircleIcon as CheckCircle} from "@phosphor-icons/react/CheckCircle";
import {CircleIcon as Circle} from "@phosphor-icons/react/Circle";
import {DotsThreeIcon as DotsThree} from "@phosphor-icons/react/DotsThree";
import {MagnifyingGlassIcon as MagnifyingGlass} from "@phosphor-icons/react/MagnifyingGlass";
import {MinusCircleIcon as MinusCircle} from "@phosphor-icons/react/MinusCircle";
import {PencilSimpleIcon as PencilSimple} from "@phosphor-icons/react/PencilSimple";
import {SparkleIcon as Sparkle} from "@phosphor-icons/react/Sparkle";
import {UserPlusIcon as UserPlus} from "@phosphor-icons/react/UserPlus";
import {XIcon as X} from "@phosphor-icons/react/X";
import {XCircleIcon as XCircle} from "@phosphor-icons/react/XCircle";
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
    parseUtcDateTimeInput,
} from "../../utils/AdminDateUtils.ts";
import {createSessionEditForm, toSessionUpdatePayload, type SessionEditForm} from "../../utils/SessionEditForm.ts";
import {generateHalfHourLocalSuggestions} from "../../utils/SessionTime.ts";
import SessionTimeDisplay, {SessionTimePreview} from "./SessionTimeDisplay";
import {getMenteeActionPolicy} from "../../utils/AdminMenteeActionPolicy.ts";
import {getMenteeAvailabilityRows, getMenteeTimeline, getWeeklyAvailabilityHours, type MenteeTimelineStep} from "../../utils/MenteeProfileUtils.ts";
import {
    MENTEE_STATUS_FILTERS,
    countHeldSessions,
    countMenteesByStatus,
    daysBetween,
    defaultMenteeSort,
    describeMenteeSince,
    formatDayCount,
    formatDaysAgo,
    formatShortUtcDate,
    getLastSession,
    getNextSession,
    nextMenteeSort,
    normalizeMenteeStatusFilter,
    sortMentees,
    toTimestamp,
    type MenteeSort,
    type MenteeSortKey,
    type MenteeStatusFilter,
} from "../../utils/MenteeListModel.ts";
import {
    autoFillAssignmentSlots,
    generateAssignmentText,
    getAssignmentSlotKey
} from "../../utils/AssignmentGenerator.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import {formatUserName} from "../../../lib/user-display-name.ts";
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
import MenteeProfileEditor from "./MenteeProfileEditor.tsx";
import SessionFeedbackPanel from "./SessionFeedbackPanel";
import RecentTrainingFeedback from "./RecentTrainingFeedback";
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

type MentorFilter = "all" | "mine" | "unassigned";
type MenteeStateAction = "pickup" | "pass";
type ProfileTab = "sessions" | "signups" | "notes";
const MENTOR_FILTER_PARAM = "mentorFilter";
const STATUS_FILTER_PARAM = "status";
const MENTEE_SEARCH_PARAM = "search";
const MAX_ASSIGNMENT_CODE_POINTS = 1500;
const countUnicodeCodePoints = (value: string): number => {
    let count = 0;
    for (let offset = 0; offset < value.length; count += 1) {
        const codePoint = value.codePointAt(offset);
        offset += codePoint != null && codePoint > 0xFFFF ? 2 : 1;
    }
    return count;
};
type MenteeActionPolicy = ReturnType<typeof getMenteeActionPolicy>;
type SessionFormState = {mentorId: string; airport: string; pilots: string; time: string};

// "waitlist" was the old combined filter, so old links still land on unassigned mentees.
const normalizeMentorFilter = (value: string | null): MentorFilter => {
    if (value === "waitlist") return "unassigned";
    return value === "mine" || value === "unassigned" ? value : "all";
};

const stateActionCopy: Record<MenteeStateAction, { title: (name: string) => string; description: (name: string, mentor?: string) => string; confirmLabel: string }> = {
    pickup: {
        title: name => `Pick up ${name}?`,
        description: name => `This assigns ${name} to you and moves them off the waitlist.`,
        confirmLabel: "Pick up mentee",
    },
    pass: {
        title: name => `Pass ${name}?`,
        description: (name, mentor) => `This marks ${name} as passed and ends the active mentorship${mentor ? ` with ${mentor}` : ""}.`,
        confirmLabel: "Pass mentee",
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
    const searchParam = searchParams.get(MENTEE_SEARCH_PARAM) ?? "";
    const [searchInput, setSearchInput] = useState(() => searchParam);
    const searchInputRef = useRef(searchParam);
    const searchInputDirtyRef = useRef(false);
    const deferredSearchInput = useDeferredValue(searchInput);
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

    const requestedMentorFilter = normalizeMentorFilter(searchParams.get(MENTOR_FILTER_PARAM));
    const mentorFilter: MentorFilter = requestedMentorFilter === "mine" && !adminUser ? "all" : requestedMentorFilter;
    const statusFilter: MenteeStatusFilter = normalizeMenteeStatusFilter(searchParams.get(STATUS_FILTER_PARAM))
        ?? (searchParams.get(MENTOR_FILTER_PARAM) === "waitlist" ? "waitlisted" : "all");
    const [sortState, setSortState] = useState<{status: MenteeStatusFilter; sort: MenteeSort | undefined}>();
    const menteeSort = useMemo(
        () => sortState?.status === statusFilter ? sortState.sort : defaultMenteeSort(statusFilter),
        [sortState, statusFilter],
    );
    const preferenceAccountId = accountId ?? adminUser?.id;
    const usersById = useMemo(() => new Map(users?.map(user => [user.id, user]) ?? []), [users]);
    const autoMatchCandidateIds = useMemo(
        () => new Set(autoMatchCandidates.map(candidate => candidate.id)),
        [autoMatchCandidates],
    );

    useEffect(() => {
        if (searchInputRef.current === searchParam) {
            searchInputDirtyRef.current = false;
            return;
        }
        if (searchInputDirtyRef.current) return;
        searchInputRef.current = searchParam;
        setSearchInput(searchParam);
    }, [searchParam]);

    const selectedMentee = useMemo(() => {
        if (!mentees || !menteeRecordId) return undefined;
        return mentees.find(mentee => String(mentee.id) === menteeRecordId);
    }, [menteeRecordId, mentees]);

    const menteeSearchTextById = useMemo(() => {
        if (!mentees) return new Map<number, string>();
        return new Map(mentees.map<[number, string]>(mentee => {
            const mentorId = getAssignedMentorId(mentee);
            const user = usersById.get(mentee.mentee);
            return [mentee.id, [
                String(mentee.id),
                String(mentee.mentee),
                mentorId == null ? undefined : String(mentorId),
                formatUserName(mentee.mentee, user?.username, mentee.ifcName),
                mentorId == null ? undefined : getUserNameFromMap(usersById, mentorId),
                mentee.ifcName,
                mentee.ifcId,
                mentee.recruiter,
                stateLabels[mentee.state],
            ].filter(Boolean).join(" ").toLowerCase()];
        }));
    }, [mentees, usersById]);

    // Refreshes whenever records change, which keeps "days ago" text honest without a ticking clock.
    const listNow = useMemo(() => mentees ? Date.now() : 0, [mentees]);

    // Search and mentor filters apply first so the status tabs can show how many records each tab holds.
    const searchedMentees = useMemo(() => {
        const normalized = deferredSearchInput.trim().toLowerCase();
        if (!mentees) return [];
        return mentees.filter(mentee => {
            if (mentorFilter === "mine" && adminUser && getAssignedMentorId(mentee) !== adminUser.id) {
                return false;
            }
            if (mentorFilter === "unassigned" && getAssignedMentorId(mentee) != null) {
                return false;
            }
            if (!normalized) {
                return true;
            }
            return menteeSearchTextById.get(mentee.id)?.includes(normalized) ?? false;
        });
    }, [adminUser, deferredSearchInput, menteeSearchTextById, mentees, mentorFilter]);

    const statusCounts = useMemo(() => countMenteesByStatus(searchedMentees), [searchedMentees]);

    const displayedMentees = useMemo(() => {
        const filtered = searchedMentees.filter(mentee => {
            if (statusFilter !== "all" && mentee.state !== statusFilter) return false;
            return !(statusFilter === "waitlisted" && autoMatchSearched && !autoMatchCandidateIds.has(mentee.id));
        });
        return sortMentees(filtered, menteeSort, {
            now: listNow,
            getName: mentee => formatUserName(mentee.mentee, usersById.get(mentee.mentee)?.username, mentee.ifcName),
            getMentorName: mentee => {
                const mentorId = getAssignedMentorId(mentee);
                return mentorId == null ? undefined : getUserNameFromMap(usersById, mentorId);
            },
        });
    }, [autoMatchCandidateIds, autoMatchSearched, listNow, menteeSort, searchedMentees, statusFilter, usersById]);

    const menteePagination = usePagination(displayedMentees, 50);
    const resetMenteePagination = menteePagination.reset;

    const listQuery = useMemo(() => {
        const nextParams = new URLSearchParams(searchParams.toString());
        if (searchInput.trim()) nextParams.set(MENTEE_SEARCH_PARAM, searchInput);
        else nextParams.delete(MENTEE_SEARCH_PARAM);
        return nextParams.toString();
    }, [searchInput, searchParams]);

    const menteeRoute = useCallback((id?: number) => {
        const path = id == null ? "/dashboard/mentees" : `/dashboard/mentees/${id}`;
        return listQuery ? `${path}?${listQuery}` : path;
    }, [listQuery]);

    const updateListQuery = useCallback((updates: {search?: string; mentorFilter?: MentorFilter; status?: MenteeStatusFilter}) => {
        const nextParams = new URLSearchParams(listQuery);
        if (updates.search !== undefined) {
            if (updates.search.trim()) nextParams.set(MENTEE_SEARCH_PARAM, updates.search);
            else nextParams.delete(MENTEE_SEARCH_PARAM);
        }
        if (updates.mentorFilter !== undefined) {
            if (updates.mentorFilter === "all") nextParams.delete(MENTOR_FILTER_PARAM);
            else nextParams.set(MENTOR_FILTER_PARAM, updates.mentorFilter);
        }
        if (updates.status !== undefined) {
            if (updates.status === "all") nextParams.delete(STATUS_FILTER_PARAM);
            else nextParams.set(STATUS_FILTER_PARAM, updates.status);
        }
        const query = nextParams.toString();
        startTransition(() => navigate(`${location.pathname}${query ? `?${query}` : ""}`, {replace: true}));
    }, [listQuery, location.pathname, navigate]);

    useEffect(() => {
        if (searchInput === searchParam) return;
        const timer = window.setTimeout(() => updateListQuery({search: searchInput}), 220);
        return () => window.clearTimeout(timer);
    }, [searchInput, searchParam, updateListQuery]);

    const handleMenteeSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const value = event.currentTarget.value;
        searchInputDirtyRef.current = value !== searchParam;
        searchInputRef.current = value;
        setSearchInput(value);
        resetMenteePagination();
    }, [resetMenteePagination, searchParam]);

    const handleMentorFilterChange = useCallback((value: string) => {
        const nextFilter = normalizeMentorFilter(value);
        resetMenteePagination();
        updateListQuery({mentorFilter: nextFilter});
    }, [resetMenteePagination, updateListQuery]);

    const handleStatusFilterChange = useCallback((status: MenteeStatusFilter) => {
        resetMenteePagination();
        updateListQuery({status});
    }, [resetMenteePagination, updateListQuery]);

    const handleSortChange = useCallback((key: MenteeSortKey) => {
        resetMenteePagination();
        setSortState({status: statusFilter, sort: nextMenteeSort(menteeSort, key)});
    }, [menteeSort, resetMenteePagination, statusFilter]);

    // Phones have no sortable headers, so a select picks the same sort directly.
    const handleSortSelect = useCallback((sort: MenteeSort | undefined) => {
        resetMenteePagination();
        setSortState({status: statusFilter, sort});
    }, [resetMenteePagination, statusFilter]);

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

    const handleAutoMatchSearch = useCallback(async (event: FormEvent) => {
        event.preventDefault();
        setAutoMatchError(undefined);

        try {
            setBusyAction("auto-match-search");
            const candidates = await ApiUtils.getAutoMatchCandidates(token, autoMatchAvailability, autoMatchLeniency);
            setAutoMatchCandidates(candidates ?? []);
            setAutoMatchSearched(true);
            setAutoMatchOpen(false);
            resetMenteePagination();
        } catch (err) {
            setAutoMatchError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusyAction(undefined);
        }
    }, [autoMatchAvailability, autoMatchLeniency, resetMenteePagination, token]);

    const clearMenteeFilters = useCallback(() => {
        searchInputDirtyRef.current = searchParam !== "";
        searchInputRef.current = "";
        setSearchInput("");
        resetMenteePagination();
        updateListQuery({search: "", mentorFilter: "all", status: "all"});
    }, [resetMenteePagination, searchParam, updateListQuery]);

    const clearAutoMatch = useCallback(() => {
        setAutoMatchCandidates([]);
        setAutoMatchSearched(false);
        resetMenteePagination();
    }, [resetMenteePagination]);
    // The helper only matches waitlisted mentees, so opening it from another tab moves to the waitlist first.
    const handleAutoMatchToggleOpen = useCallback(() => {
        if (statusFilter === "waitlisted") {
            setAutoMatchOpen(open => !open);
            return;
        }
        resetMenteePagination();
        updateListQuery({status: "waitlisted"});
        setAutoMatchOpen(true);
    }, [resetMenteePagination, statusFilter, updateListQuery]);

    useEffect(() => {
        if (statusFilter === "waitlisted") return;
        setAutoMatchCandidates([]);
        setAutoMatchSearched(false);
        setAutoMatchError(undefined);
        setAutoMatchOpen(false);
    }, [statusFilter]);

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
        }).sort(sortSessionsDesc) || [];
    }, [sessions, selectedMentee]);

    const selectedMenteeNotes = useMemo(() => {
        if (!selectedMentee || !userNotes) return [];
        return userNotes
            .filter(note => note.user === selectedMentee.mentee)
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    }, [selectedMentee, userNotes]);
    const sessionTimeSuggestions = useMemo(() => generateHalfHourLocalSuggestions(), []);

    const selectedMenteeHasMentor = selectedMentee ? getAssignedMentorId(selectedMentee) != null : false;
    const selectedActionPolicy = selectedMentee
        ? getMenteeActionPolicy({state: selectedMentee.state, hasMentor: selectedMenteeHasMentor})
        : undefined;
    const getUserName = useCallback((id?: string, fallback?: string | null) => {
        if (!id) return formatUserName(null, undefined, fallback ?? "Not set");
        return formatUserName(id, usersById.get(id)?.username, fallback);
    }, [usersById]);

    const handleOpenMentee = useCallback((id: number) => navigate(menteeRoute(id)), [menteeRoute, navigate]);

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
                    profileToken={token}
                    onProfileChanged={onMenteeChanged}
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
                    filter={searchInput}
                    mentorFilter={mentorFilter}
                    statusFilter={statusFilter}
                    statusCounts={statusCounts}
                    sort={menteeSort}
                    now={listNow}
                    adminUser={adminUser}
                    getUserName={getUserName}
                    onSearchChange={handleMenteeSearchChange}
                    onMentorFilterChange={handleMentorFilterChange}
                    onStatusFilterChange={handleStatusFilterChange}
                    onSortChange={handleSortChange}
                    onSortSelect={handleSortSelect}
                    onClearFilters={clearMenteeFilters}
                    onOpenMentee={handleOpenMentee}
                    autoMatchOpen={autoMatchOpen}
                    onAutoMatchToggleOpen={handleAutoMatchToggleOpen}
                    autoMatchCandidates={autoMatchCandidates}
                    autoMatchAvailability={autoMatchAvailability}
                    autoMatchLeniency={autoMatchLeniency}
                    autoMatchSearched={autoMatchSearched}
                    autoMatchBusy={busyAction === "auto-match-search"}
                    autoMatchError={autoMatchError}
                    onAutoMatchAvailabilityChange={setAutoMatchAvailability}
                    onAutoMatchLeniencyChange={setAutoMatchLeniency}
                    onAutoMatchSearch={handleAutoMatchSearch}
                    onAutoMatchClear={clearAutoMatch}
                />
            )}

            {pendingStateAction && selectedMentee ? (
                <MenteeActionConfirmation
                    action={pendingStateAction}
                    mentee={selectedMentee}
                    getUserName={getUserName}
                    onCancel={() => setPendingStateAction(undefined)}
                    onConfirm={handleStateActionConfirm}
                />
            ) : null}

            {showTerminateModal && selectedMentee && (
                <MenteeTerminationDialog mentee={selectedMentee} getUserName={getUserName} reason={terminateReason} onReasonChange={setTerminateReason} onCancel={() => setShowTerminateModal(false)} onConfirm={handleTerminateConfirm} busy={busyAction === "terminate"}/>
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
    statusFilter: MenteeStatusFilter;
    statusCounts: Record<MenteeStatusFilter, number>;
    sort: MenteeSort | undefined;
    now: number;
    adminUser: AdminUser | undefined;
    getUserName: (id?: string) => string;
    onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onMentorFilterChange: (value: string) => void;
    onStatusFilterChange: (status: MenteeStatusFilter) => void;
    onSortChange: (key: MenteeSortKey) => void;
    onSortSelect: (sort: MenteeSort | undefined) => void;
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
    onAutoMatchClear: () => void;
}

// Phones have no sortable headers, so these mirror the most useful header sorts.
const PHONE_SORT_OPTIONS: {label: string; sort: MenteeSort}[] = [
    {label: "Longest waiting", sort: {key: "since", direction: "asc"}},
    {label: "Next session", sort: {key: "next", direction: "asc"}},
    {label: "Most recent session", sort: {key: "last", direction: "desc"}},
    {label: "Most sessions", sort: {key: "sessions", direction: "desc"}},
    {label: "Name", sort: {key: "name", direction: "asc"}},
];
const sortValue = (sort: MenteeSort | undefined) => sort ? `${sort.key}-${sort.direction}` : "";

const MenteeListPage = ({
                            pagination,
                            filter,
                            mentorFilter,
                            statusFilter,
                            statusCounts,
                            sort,
                            now,
                            adminUser,
                            getUserName,
                            onSearchChange,
                            onMentorFilterChange,
                            onStatusFilterChange,
                            onSortChange,
                            onSortSelect,
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
                            onAutoMatchClear,
                        }: MenteeListPageProps) => {
    const hasFilters = Boolean(filter.trim()) || mentorFilter !== "all" || statusFilter !== "all";
    const autoMatchCandidateById = useMemo(
        () => new Map(autoMatchCandidates.map(candidate => [candidate.id, candidate])),
        [autoMatchCandidates],
    );
    const autoMatchVisible = statusFilter === "waitlisted" && autoMatchOpen;
    const autoMatchActive = statusFilter === "waitlisted" && autoMatchSearched;
    const currentSortValue = sortValue(sort);
    const customSort = sort != null && !PHONE_SORT_OPTIONS.some(option => sortValue(option.sort) === currentSortValue);
    return (
        <main className={styles.menteesListPage} aria-labelledby="mentees-title">
            <div className={styles.menteesIntro}>
                <h1 id="mentees-title">Mentees</h1>
                <button
                    type="button"
                    className={styles.autoMatchToggleButton}
                    aria-controls="auto-match-panel"
                    aria-expanded={autoMatchVisible}
                    onClick={onAutoMatchToggleOpen}
                >
                    <Sparkle size={18} aria-hidden="true"/>
                    <span className={styles.longLabel}>Match helper</span>
                    <span className={styles.shortLabel}>Match</span>
                    {autoMatchActive ? <span className={styles.autoMatchToggleCount}>{autoMatchCandidates.length}</span> : null}
                </button>
            </div>

            <div className={styles.statusTabs} role="group" aria-label="Filter by status">
                {MENTEE_STATUS_FILTERS.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={statusFilter === option.value}
                        className={statusFilter === option.value ? styles.statusTabActive : undefined}
                        onClick={() => onStatusFilterChange(option.value)}
                    >
                        <span>{option.label}</span>
                        <span className={styles.statusTabCount}>{statusCounts[option.value]}</span>
                    </button>
                ))}
            </div>

            <section className={styles.menteesToolbar} aria-label="Mentee filters">
                <label className={styles.searchField} htmlFor="mentee-search">
                    <span className={styles.visuallyHidden}>Search mentees</span>
                    <MagnifyingGlass size={18} aria-hidden="true"/>
                    <input
                        id="mentee-search"
                        type="search"
                        value={filter}
                        onChange={onSearchChange}
                        placeholder="Name, Discord ID, IFC, recruiter…"
                    />
                </label>
                <label className={styles.phoneStatusField} htmlFor="mentee-status-select">
                    <span>Status</span>
                    <select id="mentee-status-select" value={statusFilter} onChange={event => onStatusFilterChange(normalizeMenteeStatusFilter(event.target.value) ?? "all")}>
                        {MENTEE_STATUS_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label} ({statusCounts[option.value]})</option>)}
                    </select>
                </label>
                <label className={styles.mentorField} htmlFor="mentor-filter">
                    <span>Mentor</span>
                    <select id="mentor-filter" value={mentorFilter} onChange={event => onMentorFilterChange(event.target.value)}>
                        <option value="all">Anyone</option>
                        <option value="mine" disabled={!adminUser}>My mentees</option>
                        <option value="unassigned">Unassigned</option>
                    </select>
                </label>
                <div className={styles.filterFieldMeta}>
                    <span>{pagination.totalItems} {autoMatchActive ? (pagination.totalItems === 1 ? "match" : "matches") : (pagination.totalItems === 1 ? "mentee" : "mentees")}</span>
                    {hasFilters ? (
                        <button type="button" className={styles.clearFiltersButton} onClick={onClearFilters}>
                            <span className={styles.longLabel}>Clear filters</span>
                            <span className={styles.shortLabel}>Clear</span>
                        </button>
                    ) : null}
                    <label className={styles.phoneSortField} htmlFor="mentee-sort-select">
                        <span>Sort</span>
                        <select id="mentee-sort-select" value={currentSortValue} onChange={event => {
                            onSortSelect(PHONE_SORT_OPTIONS.find(option => sortValue(option.sort) === event.target.value)?.sort);
                        }}>
                            <option value="">Default order</option>
                            {customSort ? <option value={currentSortValue}>Custom order</option> : null}
                            {PHONE_SORT_OPTIONS.map(option => <option key={option.label} value={sortValue(option.sort)}>{option.label}</option>)}
                        </select>
                    </label>
                </div>
            </section>

            {autoMatchActive ? (
                <div className={styles.autoMatchResultBanner} role="status">
                    <p>Showing waitlisted mentees whose availability is close to yours.</p>
                    <button type="button" onClick={onAutoMatchClear}>Show whole waitlist</button>
                </div>
            ) : null}

            {pagination.paginatedItems.length > 0 ? (
                <MenteeTable
                    mentees={pagination.paginatedItems}
                    now={now}
                    sort={sort}
                    statusFilter={statusFilter}
                    getUserName={getUserName}
                    onOpen={onOpenMentee}
                    onSortChange={onSortChange}
                    autoMatchActive={autoMatchActive}
                    candidateById={autoMatchCandidateById}
                />
            ) : (
                <div className={styles.menteesEmptyState}>
                    <h2>No mentees match these filters</h2>
                    <p>Try a broader search or clear the filters to see the full queue.</p>
                    {hasFilters ? <button type="button" className={styles.clearFiltersButton} onClick={onClearFilters}>Clear filters</button> : null}
                </div>
            )}

            <AdminPagination
                {...pagination}
                totalItems={pagination.totalItems}
                className={styles.menteesPagination}
            />

            {autoMatchVisible ? (
                <AutoMatchPanel
                    availability={autoMatchAvailability}
                    leniency={autoMatchLeniency}
                    busy={autoMatchBusy}
                    error={autoMatchError}
                    onAvailabilityChange={onAutoMatchAvailabilityChange}
                    onLeniencyChange={onAutoMatchLeniencyChange}
                    onSearch={onAutoMatchSearch}
                    onClose={onAutoMatchToggleOpen}
                />
            ) : null}
        </main>
    );
};

interface AutoMatchPanelProps {
    availability: string;
    leniency: AutoMatchLeniency;
    busy: boolean;
    error: string | undefined;
    onAvailabilityChange: (value: string) => void;
    onLeniencyChange: (value: AutoMatchLeniency) => void;
    onSearch: (event: FormEvent) => void;
    onClose: () => void;
}

// A side drawer keeps the list visible behind it; results filter the waitlist once the search runs.
const AutoMatchPanel = memo(function AutoMatchPanel({
                            availability,
                            leniency,
                            busy,
                            error,
                            onAvailabilityChange,
                            onLeniencyChange,
                            onSearch,
                            onClose,
                        }: AutoMatchPanelProps) {
    const drawerRef = useMenteeDialogFocus(onClose);
    useBodyScrollLock();
    return (
        <div className={styles.drawerBackdrop} role="presentation" onClick={onClose}>
            <aside ref={drawerRef} id="auto-match-panel" className={styles.autoMatchPanel} role="dialog" aria-modal="true" aria-labelledby="auto-match-title" onClick={event => event.stopPropagation()}>
                <header className={styles.autoMatchHeader}>
                    <div>
                        <h2 id="auto-match-title">Match helper</h2>
                        <p>Find waitlisted mentees whose weekly availability is close to yours. Times are UTC.</p>
                    </div>
                    <button type="button" className={styles.dialogClose} onClick={onClose} aria-label="Close match helper"><X size={20} aria-hidden="true"/></button>
                </header>

                <form className={styles.autoMatchForm} onSubmit={onSearch}>
                    <fieldset>
                        <legend>Your availability</legend>
                        <WeeklyAvailabilityEditor id="mentor-weekly-availability" value={availability} onChange={onAvailabilityChange}/>
                    </fieldset>
                    <div className={styles.autoMatchActions}>
                        <label>
                            <span>Match leniency</span>
                            <select value={leniency} onChange={event => onLeniencyChange(event.target.value as AutoMatchLeniency)}>
                                <option value="strict">Strict · overlap only</option>
                                <option value="medium">Medium · up to 30 min gap</option>
                                <option value="very-loose">Very loose · up to 2 hr gap</option>
                            </select>
                        </label>
                        <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Finding…" : "Find matches"}</button>
                    </div>
                </form>

                {error ? <p className={styles.autoMatchError} role="alert">{error}</p> : null}
                <p className={styles.autoMatchHint}>Your availability and leniency are saved to your account. Results filter the waitlist behind this panel.</p>
            </aside>
        </div>
    );
});

const MENTEE_TABLE_COLUMNS: {key: MenteeSortKey; label: string}[] = [
    {key: "name", label: "Mentee"},
    {key: "status", label: "Status"},
    {key: "mentor", label: "Mentor"},
    {key: "since", label: "Waiting / since"},
    {key: "next", label: "Next session"},
    {key: "last", label: "Last session"},
    {key: "sessions", label: "Sessions"},
];

interface MenteeTableProps {
    mentees: AdminMentee[];
    now: number;
    sort: MenteeSort | undefined;
    statusFilter: MenteeStatusFilter;
    getUserName: (id?: string, fallback?: string | null) => string;
    onOpen: (id: number) => void;
    onSortChange: (key: MenteeSortKey) => void;
    autoMatchActive: boolean;
    candidateById: Map<number, AutoMatchCandidate>;
}

// Rows open the profile from anywhere; the name button keeps that reachable by keyboard and screen readers.
const openRowUnlessControl = (event: MouseEvent<HTMLTableRowElement>, open: () => void) => {
    if ((event.target as HTMLElement).closest("button, a, input, select")) return;
    open();
};

// The wait bar fills over two months and turns amber once a mentee has waited a month.
const WAIT_BAR_DAYS = 60;
const LONG_WAIT_DAYS = 30;

const MenteeTable = memo(function MenteeTable({mentees, now, sort, statusFilter, getUserName, onOpen, onSortChange, autoMatchActive, candidateById}: MenteeTableProps) {
    return (
    <div className={styles.menteesTableWrap}>
        <table className={styles.menteesTable}>
            <caption className={styles.visuallyHidden}>Mentee records. Select a row to open the mentee profile.</caption>
            <thead>
            <tr>
                {MENTEE_TABLE_COLUMNS.map(column => {
                    const active = sort?.key === column.key;
                    const label = column.key === "since" && statusFilter === "waitlisted" ? "Waiting" : column.label;
                    return (
                        <th key={column.key} scope="col" aria-sort={active ? (sort?.direction === "asc" ? "ascending" : "descending") : undefined}>
                            <button type="button" className={styles.sortButton} onClick={() => onSortChange(column.key)}>
                                {label}
                                {active
                                    ? <CaretUp size={13} aria-hidden="true" className={sort?.direction === "desc" ? styles.sortIconDesc : undefined}/>
                                    : <CaretUpDown size={13} aria-hidden="true" className={styles.sortIconIdle}/>}
                            </button>
                        </th>
                    );
                })}
                <th scope="col"><span className={styles.visuallyHidden}>Open profile</span></th>
            </tr>
            </thead>
            <tbody>
            {mentees.map(mentee => {
                const match = autoMatchActive ? candidateById.get(mentee.id) : undefined;
                const nextSession = getNextSession(mentee, now);
                const lastSession = getLastSession(mentee, now);
                const lastSessionTime = toTimestamp(lastSession?.time);
                const hasMentor = getAssignedMentorId(mentee) != null;
                const waitlistTime = mentee.state === "waitlisted" ? toTimestamp(mentee.waitlistTime) : undefined;
                const waitDays = waitlistTime == null ? undefined : daysBetween(waitlistTime, now);
                const active = mentee.state === "waitlisted" || mentee.state === "picked_up";
                const nothingBooked = mentee.state === "picked_up" && !nextSession;
                return (
                    <tr key={mentee.id} className={styles.menteeRow} onClick={event => openRowUnlessControl(event, () => onOpen(mentee.id))}>
                        <th scope="row" data-label="Mentee">
                            <div className={styles.tableMenteeIdentity}>
                                <button type="button" className={styles.tableMenteeButton} onClick={() => onOpen(mentee.id)}>
                                    <strong>{getUserName(mentee.mentee, mentee.ifcName)}</strong>
                                    <small>#{mentee.id} · {formatIfcDisplay(mentee)}</small>
                                </button>
                                {match ? (
                                    <small className={styles.tableMatchSummary}>
                                        {formatAutoMatchSummary(match)} · {match.timezone || "Timezone not provided"}
                                    </small>
                                ) : null}
                            </div>
                        </th>
                        <td data-label="Status"><span className={`${styles.stateBadge} ${styles[`${mentee.state}Badge`]}`}>{stateLabels[mentee.state]}</span></td>
                        <td data-label="Mentor" className={hasMentor ? undefined : styles.mutedCell}><span className={styles.phoneLabel}>Mentor </span>{hasMentor ? getMentorDisplayName(mentee, getUserName) : "Unassigned"}</td>
                        <td data-label="Waiting / since">
                            <span className={waitDays == null ? undefined : styles.waitText}>{describeMenteeSince(mentee, now)}</span>
                            {waitDays == null ? null : (
                                <span className={styles.waitBar} data-long={waitDays >= LONG_WAIT_DAYS ? "true" : undefined} aria-hidden="true">
                                    <span style={{width: `${Math.min(100, waitDays / WAIT_BAR_DAYS * 100)}%`}}/>
                                </span>
                            )}
                        </td>
                        <td data-label="Next session" data-empty={!nextSession && !nothingBooked ? "true" : undefined} className={nextSession ? undefined : styles.mutedCell}>
                            {nextSession ? <><span className={styles.phoneLabel}>Next: </span>{formatNextSession(nextSession)}</> : <span className={styles.desktopOnly}>{active ? "None booked" : "—"}</span>}
                            {nothingBooked ? <span className={styles.attentionFlag}>Nothing booked</span> : null}
                        </td>
                        <td data-label="Last session" className={lastSessionTime == null ? styles.mutedCell : undefined}>{lastSessionTime == null ? "None yet" : formatDaysAgo(lastSessionTime, now)}</td>
                        <td data-label="Sessions" className={styles.numericCell}>{mentee.sessions.length}</td>
                        <td className={styles.rowChevron} aria-hidden="true"><CaretRight size={16}/></td>
                    </tr>
                );
            })}
            </tbody>
        </table>
    </div>
    );
});

interface MenteeProfilePageProps {
    profileToken: string | null;
    onProfileChanged: (mentee: AdminMentee) => void;
    selectedMentee: AdminMentee | undefined;
    getUserName: (id?: string, fallback?: string | null) => string;
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

const MenteeProfilePage = ({profileToken, onProfileChanged,
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
    const [activeTab, setActiveTab] = useState<ProfileTab>("sessions");
    const [scheduleOpen, setScheduleOpen] = useState(false);
    // One session dialog serves every list; sign-ups from other mentorships open read-only.
    const [viewedSession, setViewedSession] = useState<{session: Session; editable: boolean}>();
    const tabsRef = useRef<HTMLElement>(null);
    const now = useMemo(() => selectedMentee ? Date.now() : 0, [selectedMentee]);

    if (!selectedMentee) {
        return (
            <main className={styles.profileNotFound}>
                <button type="button" className={styles.profileBackButton} onClick={onBack}><ArrowLeft size={17} aria-hidden="true"/>Back to mentees</button>
                <h1>Mentee not found</h1>
                <p>This mentee record may have been removed or you may not have access to it.</p>
            </main>
        );
    }

    const menteeName = getUserName(selectedMentee.mentee, selectedMentee.ifcName);
    const nextSession = getNextSession(selectedMentee, now);
    const assignmentsAvailable = assignments.length > 0;
    const openSession = (session: Session, editable: boolean) => setViewedSession({session, editable});
    const showSessions = () => {
        setActiveTab("sessions");
        tabsRef.current?.scrollIntoView({behavior: "smooth", block: "start"});
    };
    const refreshViewed = (updatedSession: Session | undefined) => {
        if (updatedSession) setViewedSession(current => current ? {...current, session: updatedSession} : current);
        return updatedSession;
    };
    const tabs: {id: ProfileTab; label: string; shortLabel: string; count: number}[] = [
        {id: "sessions", label: "Training sessions", shortLabel: "Sessions", count: selectedMentee.sessions.length},
        {id: "signups", label: "Session sign-ups", shortLabel: "Sign-ups", count: attendedSessions.length},
        {id: "notes", label: "Notes", shortLabel: "Notes", count: selectedMenteeNotes.length},
    ];
    const primaryAction = selectedActionPolicy?.canPickup
        ? <button type="button" className={styles.profilePrimaryAction} onClick={onPickup} disabled={busyAction === "pickup"}><UserPlus size={18} aria-hidden="true"/>Pick up mentee</button>
        : selectedActionPolicy?.canPass
            ? <button type="button" className={styles.profilePrimaryAction} onClick={onPass} disabled={busyAction === "pass"}><Check size={18} weight="bold" aria-hidden="true"/>Pass mentee</button>
            : null;

    return (
        <main className={styles.profilePage} aria-labelledby="mentee-profile-title">
            <nav className={styles.profileBreadcrumb} aria-label="Breadcrumb">
                <button type="button" className={styles.profileBackButton} onClick={onBack}><ArrowLeft size={17} aria-hidden="true"/>Back to mentees</button>
            </nav>
            <MenteeProfileEditor
                key={selectedMentee.id}
                mentee={selectedMentee}
                menteeName={menteeName}
                token={profileToken}
                onSaved={onProfileChanged}
                triggerClassName={styles.profileSecondaryAction}
                triggerContent={<><PencilSimple size={17} aria-hidden="true"/>Edit<span className={styles.longLabel}>&nbsp;profile</span></>}
            >
                {editProfileButton => <>
                    <section className={styles.profileHeaderCard}>
                        <header className={styles.profileHeader}>
                            <div className={styles.profileIdentity}>
                                <div className={styles.profileTitleRow}>
                                    <h1 id="mentee-profile-title">{menteeName}</h1>
                                    <span className={`${styles.stateBadge} ${styles[`${selectedMentee.state}Badge`]}`}>{stateLabels[selectedMentee.state]}</span>
                                </div>
                                <p>Record #{selectedMentee.id} · IFC {formatIfcDisplay(selectedMentee)} · Discord {selectedMentee.mentee}</p>
                            </div>
                            <div className={styles.profileActionButtons}>
                                {editProfileButton}
                                {selectedActionPolicy?.canSchedule ? <button type="button" className={styles.profileSecondaryAction} onClick={() => setScheduleOpen(true)}><CalendarBlank size={17} aria-hidden="true"/>Schedule<span className={styles.longLabel}>&nbsp;session</span></button> : null}
                                {primaryAction}
                                {selectedActionPolicy?.canTerminate ? <MenteeProfileActionMenu onTerminate={onTerminate} busy={busyAction === "terminate"}/> : null}
                            </div>
                        </header>
                        <MenteeMentorshipProgress mentee={selectedMentee} now={now}/>
                    </section>

                    <AdminToast message={actionError} onDismiss={onDismissActionError}/>

                    <MenteeNextSession
                        mentee={selectedMentee}
                        session={nextSession}
                        now={now}
                        getUserName={getUserName}
                        canSchedule={selectedActionPolicy?.canSchedule ?? false}
                        assignmentsAvailable={assignmentsAvailable}
                        onSchedule={() => setScheduleOpen(true)}
                        onShowSessions={showSessions}
                        onView={session => openSession(session, true)}
                        onOpenAssignmentGenerator={onOpenAssignmentGenerator}
                    />
                </>}
            </MenteeProfileEditor>

            <MenteeMentorshipDetails mentee={selectedMentee} getUserName={getUserName}/>
            <MenteeAvailability mentee={selectedMentee}/>

            <section ref={tabsRef} className={styles.profileTabsCard} aria-label="Mentee records">
                <div className={styles.profileTabs} role="tablist" aria-label="Mentee records">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            id={`mentee-tab-${tab.id}`}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            aria-controls={`mentee-panel-${tab.id}`}
                            tabIndex={activeTab === tab.id ? 0 : -1}
                            onClick={() => setActiveTab(tab.id)}
                            onKeyDown={event => {
                                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                                const index = tabs.findIndex(candidate => candidate.id === activeTab);
                                const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                                setActiveTab(next.id);
                                document.getElementById(`mentee-tab-${next.id}`)?.focus();
                            }}
                        >
                            <span className={styles.longLabel}>{tab.label}</span>
                            <span className={styles.shortLabel}>{tab.shortLabel}</span>
                            <span className={styles.tabCount}>{tab.count}</span>
                        </button>
                    ))}
                </div>

                <div id="mentee-panel-sessions" role="tabpanel" aria-labelledby="mentee-tab-sessions" hidden={activeTab !== "sessions"} className={styles.profileTabPanel}>
                    {selectedMentee.sessions.length === 0 ? (
                        <div className={styles.profileTabEmpty}>
                            <p>No mentee training sessions scheduled or previously held.</p>
                            {selectedActionPolicy?.canSchedule ? <button type="button" className={styles.secondaryButton} onClick={() => setScheduleOpen(true)}>Schedule session</button> : null}
                        </div>
                    ) : null}
                    {selectedSessions.future.length > 0 ? (
                        <SessionSection title="Upcoming" sessions={selectedSessions.future} now={now} getUserName={getUserName} assignmentsAvailable={assignmentsAvailable} onView={session => openSession(session, true)} onOpenAssignmentGenerator={onOpenAssignmentGenerator}/>
                    ) : null}
                    {selectedSessions.past.length > 0 ? (
                        <SessionSection title="Past" sessions={selectedSessions.past} now={now} getUserName={getUserName} assignmentsAvailable={assignmentsAvailable} onView={session => openSession(session, true)} onOpenAssignmentGenerator={onOpenAssignmentGenerator}/>
                    ) : null}
                </div>
                <div id="mentee-panel-signups" role="tabpanel" aria-labelledby="mentee-tab-signups" hidden={activeTab !== "signups"} className={styles.profileTabPanel}>
                    <AttendedSessionSection sessions={attendedSessions} now={now} getUserName={getUserName} onView={session => openSession(session, false)}/>
                </div>
                <div id="mentee-panel-notes" role="tabpanel" aria-labelledby="mentee-tab-notes" hidden={activeTab !== "notes"} className={styles.profileTabPanel}>
                    <UserNotesSection notes={selectedMenteeNotes} getUserName={getUserName}/>
                </div>
            </section>

            <RecentTrainingFeedback menteeRecordId={selectedMentee.id}/>

            {scheduleOpen && selectedActionPolicy?.canSchedule ? (
                <MenteeScheduleDialog
                    menteeName={menteeName}
                    sessionForm={sessionForm}
                    onSessionFormChange={onSessionFormChange}
                    sessionTimeSuggestions={sessionTimeSuggestions}
                    busy={busyAction === "schedule"}
                    onCancel={() => setScheduleOpen(false)}
                    onSubmit={event => {
                        onSchedule(event);
                        setScheduleOpen(false);
                    }}
                />
            ) : null}

            {viewedSession ? (
                <SessionDetailsModal
                    session={viewedSession.session}
                    getUserName={getUserName}
                    editable={viewedSession.editable}
                    readOnlyNote={viewedSession.editable ? undefined : `${menteeName} joined this session as a pilot. It belongs to ${getUserName(viewedSession.session.mentee)}’s mentorship, so it is read-only here.`}
                    busyAction={busyAction}
                    attendeeInput={attendeeInputs[viewedSession.session.id] ?? ""}
                    sessionTimeSuggestions={sessionTimeSuggestions}
                    onAttendeeInputChange={value => onAttendeeInputChange(viewedSession.session.id, value)}
                    onUpdateSession={async form => refreshViewed(await onUpdateSession(viewedSession.session.id, form))}
                    onAddAttendee={async event => refreshViewed(await onAddAttendee(event, viewedSession.session.id))}
                    onRemoveAttendee={async attendeeId => refreshViewed(await onRemoveAttendee(viewedSession.session.id, attendeeId))}
                    onCancelSession={async () => refreshViewed(await onCancelSession(viewedSession.session.id))}
                    onClose={() => setViewedSession(undefined)}
                />
            ) : null}
        </main>
    );
};

const DAY_MS = 86_400_000;
const sessionTileFormat = new Intl.DateTimeFormat("en-GB", {weekday: "short", day: "numeric", month: "short", timeZone: "UTC"});
const sessionHeadlineFormat = new Intl.DateTimeFormat("en-GB", {weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC"});

const getDateParts = (time: number) => {
    const parts = sessionTileFormat.formatToParts(new Date(time));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(candidate => candidate.type === type)?.value ?? "";
    return {weekday: part("weekday"), day: part("day"), month: part("month")};
};

// "Thu 29 Oct, 18:30 UTC" reads the same whatever the browser locale.
const formatSessionHeadline = (time: number) => {
    const parts = sessionHeadlineFormat.formatToParts(new Date(time));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(candidate => candidate.type === type)?.value ?? "";
    return `${part("weekday")} ${part("day")} ${part("month")}, ${part("hour")}:${part("minute")} UTC`;
};

const describeTimeUntil = (time: number, now: number) => {
    const minutes = Math.round((time - now) / 60_000);
    if (minutes < 60) return "Starting soon";
    if (minutes < 24 * 60) return `In ${Math.round(minutes / 60)} h`;
    const days = Math.floor((time - now) / DAY_MS);
    return `In ${days} ${days === 1 ? "day" : "days"}`;
};

// Local time depends on the browser, so it is filled in after hydration.
const LocalTime = ({time}: {time: number}) => {
    const [local, setLocal] = useState("");
    useEffect(() => setLocal(new Intl.DateTimeFormat(undefined, {hour: "2-digit", minute: "2-digit"}).format(new Date(time))), [time]);
    return local ? <> · {local} your time</> : null;
};

const MenteeNextSession = ({mentee, session, now, getUserName, canSchedule, assignmentsAvailable, onSchedule, onShowSessions, onView, onOpenAssignmentGenerator}: {
    mentee: AdminMentee;
    session: Session | undefined;
    now: number;
    getUserName: (id?: string) => string;
    canSchedule: boolean;
    assignmentsAvailable: boolean;
    onSchedule: () => void;
    onShowSessions: () => void;
    onView: (session: Session) => void;
    onOpenAssignmentGenerator: (session: Session, existingAssignment?: SessionAssignment) => void;
}) => {
    const time = toTimestamp(session?.time);
    if (!session || time == null) {
        return (
            <section className={`${styles.profileBlock} ${styles.nextSessionBlock}`} aria-labelledby="mentee-next-session-title">
                <div className={styles.nextSessionTile} data-empty="true" aria-hidden="true"><CalendarBlank size={26}/></div>
                <div className={styles.nextSessionText}>
                    <h2 id="mentee-next-session-title" className={styles.blockEyebrow}>Next session</h2>
                    <p className={styles.nextSessionTime}>No session booked</p>
                    {mentee.sessions.length > 0 ? <p>{mentee.sessions.length} {mentee.sessions.length === 1 ? "session" : "sessions"} on record.</p> : null}
                </div>
                <div className={styles.nextSessionActions}>
                    {canSchedule ? <button type="button" className={styles.secondaryButton} onClick={onSchedule}>Schedule session</button> : null}
                    {mentee.sessions.length > 0 ? <button type="button" className={styles.secondaryButton} onClick={onShowSessions}>Past sessions</button> : null}
                </div>
            </section>
        );
    }
    const date = getDateParts(time);
    return (
        <section className={`${styles.profileBlock} ${styles.nextSessionBlock}`} aria-labelledby="mentee-next-session-title">
            <div className={styles.nextSessionTile} aria-hidden="true">
                <span>{date.weekday}</span>
                <strong>{date.day}</strong>
                <span>{date.month}</span>
            </div>
            <div className={styles.nextSessionText}>
                <h2 id="mentee-next-session-title" className={styles.blockEyebrow}>Next session</h2>
                <p className={styles.nextSessionTime}>{formatSessionHeadline(time)}</p>
                <p>{describeTimeUntil(time, now)}<LocalTime time={time}/> · {session.airport || "No airport"} · Mentor {getUserName(session.mentor)} · {formatPilotCount(session)} pilots</p>
            </div>
            <div className={styles.nextSessionActions}>
                <button type="button" className={styles.secondaryButton} disabled={!assignmentsAvailable} onClick={() => onOpenAssignmentGenerator(session)}>
                    {session.hasAssignment ? "Edit assignment" : "Generate assignment"}
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => onView(session)}>View session</button>
            </div>
        </section>
    );
};

const MenteeMentorshipDetails = ({mentee, getUserName}: {mentee: AdminMentee; getUserName: (id?: string) => string}) => (
    <section className={styles.profileBlock} aria-labelledby="mentee-details-title">
        <h2 id="mentee-details-title" className={styles.blockTitle}>Mentorship details</h2>
        <dl className={styles.profileFacts}>
            <div><dt>Mentor</dt><dd>{getAssignedMentorId(mentee) ? getMentorDisplayName(mentee, getUserName) : "Not assigned"}</dd></div>
            <div><dt>Recruiter</dt><dd>{mentee.recruiter || "Not set"}</dd></div>
            <div><dt>Region</dt><dd>{mentee.region || "Not provided"}</dd></div>
            <div><dt>Timezone</dt><dd>{mentee.timezone || "Not provided"}</dd></div>
        </dl>
        {mentee.terminationReason ? <div className={styles.profileTerminationReason}><strong>Termination reason</strong><p>{mentee.terminationReason}</p></div> : null}
    </section>
);

const MenteeAvailability = ({mentee}: {mentee: AdminMentee}) => {
    const availability = getMenteeAvailabilityRows(mentee.availability);
    const hours = getWeeklyAvailabilityHours(availability);
    return (
        <section className={styles.profileBlock} aria-labelledby="mentee-availability-title">
            <div className={styles.blockHeading}>
                <h2 id="mentee-availability-title" className={styles.blockTitle}>Weekly availability (UTC)</h2>
                <span>{availability.length > 0 ? `${hours} h a week · ` : ""}00:00 is midnight at the end of the day</span>
            </div>
            {availability.length > 0 ? <>
                <div className={styles.availabilityRuler} aria-hidden="true"><span/><span><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></span></div>
                <dl className={styles.profileAvailabilityList}>
                    {availability.map(({day, label, segments}, index) => <div key={`${day}-${index}`} data-empty={segments.length === 0 ? "true" : undefined}>
                        <dt>{day}</dt>
                        <dd>
                            <div className={styles.availabilityTrack} aria-hidden="true">
                                {segments.map((segment, segmentIndex) => <span key={segmentIndex} style={{left: `${segment.start / 1440 * 100}%`, width: `${(segment.end - segment.start) / 1440 * 100}%`}}/>)}
                            </div>
                            <span>{label}</span>
                        </dd>
                    </div>)}
                </dl>
            </> : <p className={styles.blockEmpty}>Availability not provided.</p>}
        </section>
    );
};

const UserNotesSection = ({notes, getUserName}: { notes: UserNote[]; getUserName: (id?: string) => string }) => (
    <section className={styles.userNotesSection}>
        <p className={styles.tabIntro}>Staff notes on this member, newest first. Notes are added from User notes.</p>
        {notes.length === 0 ? (
            <p className={styles.blockEmpty}>No notes yet for this mentee.</p>
        ) : (
            <div className={styles.userNotesList}>
                {notes.map(note => (
                    <article key={note.id} className={`${styles.userNoteItem} ${note.active ? "" : styles.inactiveUserNote}`}>
                        <div className={styles.userNoteMeta}>
                            <strong>{getUserName(note.staff)}</strong>
                            <span>{formatAdminUtcDate(note.time)}</span>
                            <span className={`${styles.sessionPill} ${note.active ? styles.pillHeld : styles.pillCancelled}`}>{note.active ? "Active" : "Inactive"}</span>
                        </div>
                        <p>{note.note}</p>
                    </article>
                ))}
            </div>
        )}
    </section>
);

type SessionStatusTone = "scheduled" | "held" | "interrupted" | "notHeld" | "cancelled";
const sessionPillClass: Record<SessionStatusTone, string> = {
    scheduled: styles.pillScheduled,
    held: styles.pillHeld,
    interrupted: styles.pillInterrupted,
    notHeld: styles.pillCancelled,
    cancelled: styles.pillCancelled,
};

// Past sessions count as held unless feedback says otherwise, matching the "Sessions held" stat.
const getSessionStatus = (session: Session, now: number): {label: string; tone: SessionStatusTone} => {
    if (session.cancelled) return {label: "Cancelled", tone: "cancelled"};
    const time = toTimestamp(session.time);
    if (time == null || time >= now) return {label: "Scheduled", tone: "scheduled"};
    if (session.trainingOutcome === "NOT_HELD") return {label: "Not held", tone: "notHeld"};
    if (session.trainingOutcome === "INTERRUPTED") return {label: "Interrupted", tone: "interrupted"};
    return {label: "Held", tone: "held"};
};

const SessionStatusPill = ({session, now}: {session: Session; now: number}) => {
    const status = getSessionStatus(session, now);
    return <span className={`${styles.sessionPill} ${sessionPillClass[status.tone]}`}>{status.label}</span>;
};

// Fixed columns keep View in the same place whether or not a row has an assignment button.
const SessionRows = ({sessions, now, statusHeading, compact, describe, renderActions}: {
    sessions: Session[];
    now: number;
    statusHeading: string;
    compact?: boolean;
    describe: (session: Session) => string;
    renderActions: (session: Session) => ReactNode;
}) => (
    <div className={`${styles.sessionList} ${compact ? styles.sessionListCompact : ""}`}>
        <div className={styles.sessionListHeader} aria-hidden="true"><span>Date &amp; time (UTC)</span><span>Session</span><span>{statusHeading}</span><span>Actions</span></div>
        <ul>
            {sessions.map(session => (
                <li key={session.id} className={styles.sessionRow} data-cancelled={session.cancelled ? "true" : undefined}>
                    <span className={styles.sessionRowTime}><SessionTimeDisplay value={session.time}/></span>
                    <span className={styles.sessionRowMeta}>{describe(session)}</span>
                    <span className={styles.sessionRowStatus}><SessionStatusPill session={session} now={now}/></span>
                    <span className={styles.sessionRowActions}>{renderActions(session)}</span>
                </li>
            ))}
        </ul>
    </div>
);

const SessionSection = ({title, sessions, now, getUserName, assignmentsAvailable, onView, onOpenAssignmentGenerator}: {
    title: string;
    sessions: Session[];
    now: number;
    getUserName: (id?: string) => string;
    assignmentsAvailable: boolean;
    onView: (session: Session) => void;
    onOpenAssignmentGenerator: (session: Session, existingAssignment?: SessionAssignment) => void;
}) => (
    <section className={styles.sessionsSection} aria-label={`${title} sessions`}>
        <h3 className={styles.blockEyebrow}>{title}</h3>
        <SessionRows
            sessions={sessions}
            now={now}
            statusHeading="Status"
            describe={session => `${session.airport || "No airport"} · Mentor ${getUserName(session.mentor)} · ${formatPilotCount(session)} pilots`}
            renderActions={session => <>
                <button type="button" className={styles.viewButton} aria-label={`View session #${session.id}, ${formatAdminUtcDate(session.time)}`} onClick={() => onView(session)}>View</button>
                {!session.cancelled ? (
                    <button
                        type="button"
                        className={styles.assignmentButton}
                        aria-label={`${session.hasAssignment ? "Edit" : "Generate"} assignment for session #${session.id}`}
                        onClick={() => onOpenAssignmentGenerator(session)}
                        disabled={!assignmentsAvailable}
                    >
                        {session.hasAssignment ? "Edit" : "Generate"}<span className={styles.longLabel}>&nbsp;assignment</span>
                    </button>
                ) : null}
            </>}
        />
    </section>
);

const AttendedSessionSection = ({sessions, now, getUserName, onView}: {
    sessions: Session[];
    now: number;
    getUserName: (id?: string) => string;
    onView: (session: Session) => void;
}) => {
    const [showAll, setShowAll] = useState(false);
    const visibleSessions = showAll ? sessions : sessions.slice(0, 4);

    return (
        <section className={styles.profileSignupSection} aria-label="Session sign-ups">
            <p className={styles.tabIntro}>Sessions this mentee joined as a pilot, newest first. Times are UTC. Status is as recorded.</p>
            {sessions.length === 0 ? (
                <p className={styles.blockEmpty}>No pilot sign-ups recorded.</p>
            ) : (
                <div id="mentee-signup-history">
                    <SessionRows
                        sessions={visibleSessions}
                        now={now}
                        statusHeading="Recorded status"
                        compact
                        describe={session => `${session.airport || "No airport"} · Mentor ${getUserName(session.mentor)} · Mentee ${getUserName(session.mentee)}`}
                        renderActions={session => (
                            <button type="button" className={styles.viewButton} aria-label={`View session at ${session.airport || "unknown airport"}, ${formatAdminUtcDate(session.time)}`} onClick={() => onView(session)}>View</button>
                        )}
                    />
                </div>
            )}
            {sessions.length > 4 ? <button type="button" className={styles.profileHistoryToggle} aria-expanded={showAll} aria-controls="mentee-signup-history" onClick={() => setShowAll(value => !value)}>
                {showAll ? "Show fewer" : `View all ${sessions.length}`}<CaretRight size={15} aria-hidden="true"/>
            </button> : null}
        </section>
    );
};

const useBodyScrollLock = () => {
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = previousOverflow; };
    }, []);
};

type DialogSize = "small" | "medium" | "large" | "wide";

// Every mentee dialog shares one frame: phones get a bottom sheet for small confirmations and a full screen for the rest.
const MenteeDialog = ({size, titleId, title, eyebrow, pill, subtitle, closeLabel = "Close", onDismiss, dismissDisabled = false, closeOnBackdrop = false, role = "dialog", describedBy, tabs, footer, children}: {
    size: DialogSize;
    titleId: string;
    title: ReactNode;
    eyebrow?: ReactNode;
    pill?: ReactNode;
    subtitle?: ReactNode;
    closeLabel?: string;
    onDismiss: () => void;
    dismissDisabled?: boolean;
    closeOnBackdrop?: boolean;
    role?: "dialog" | "alertdialog";
    describedBy?: string;
    tabs?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
}) => {
    const dismiss = () => { if (!dismissDisabled) onDismiss(); };
    const dialogRef = useMenteeDialogFocus(dismiss);
    useBodyScrollLock();
    return (
        <div className={styles.dialogBackdrop} data-size={size} role="presentation" onClick={closeOnBackdrop ? dismiss : undefined}>
            <div ref={dialogRef} className={styles.dialog} data-size={size} role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} onClick={event => event.stopPropagation()}>
                <header className={styles.dialogHeader}>
                    <div className={styles.dialogHeading}>
                        {eyebrow ? <p className={styles.dialogEyebrow}>{eyebrow}</p> : null}
                        <div className={styles.dialogTitleRow}><h2 id={titleId}>{title}</h2>{pill}</div>
                        {subtitle ? <div className={styles.dialogSubtitle}>{subtitle}</div> : null}
                    </div>
                    <button type="button" className={styles.dialogClose} onClick={dismiss} disabled={dismissDisabled} aria-label={closeLabel}><X size={20} aria-hidden="true"/></button>
                </header>
                {tabs}
                <div className={styles.dialogBody}>{children}</div>
                {footer ? <footer className={styles.dialogFooter}>{footer}</footer> : null}
            </div>
        </div>
    );
};

const MenteeScheduleDialog = ({menteeName, sessionForm, onSessionFormChange, sessionTimeSuggestions, busy, onCancel, onSubmit}: {
    menteeName: string;
    sessionForm: SessionFormState;
    onSessionFormChange: (changes: Partial<SessionFormState>) => void;
    sessionTimeSuggestions: string[];
    busy: boolean;
    onCancel: () => void;
    onSubmit: (event: FormEvent) => void;
}) => (
    <MenteeDialog
        size="medium"
        titleId="mentee-schedule-title"
        eyebrow={menteeName}
        title="Schedule session"
        closeLabel="Close scheduling"
        onDismiss={onCancel}
        footer={<>
            <button type="button" className={styles.secondaryButton} onClick={onCancel}>Cancel</button>
            <button type="submit" form="mentee-schedule-form" className={styles.primaryButton} disabled={busy}>Schedule session</button>
        </>}
    >
        <form id="mentee-schedule-form" className={styles.dialogForm} onSubmit={onSubmit}>
            <p className={styles.dialogText}>Create the next practical session for this mentee.</p>
            <label>Mentor Discord ID<input value={sessionForm.mentorId} onChange={event => onSessionFormChange({mentorId: event.target.value})} placeholder="Blank for you"/></label>
            <div className={styles.inlineInputs}>
                <label>Airport<input value={sessionForm.airport} onChange={event => onSessionFormChange({airport: event.target.value.toUpperCase()})} placeholder="ICAO code" maxLength={5} required/></label>
                <label>Pilot places<input type="number" min="1" max="99" value={sessionForm.pilots} onChange={event => onSessionFormChange({pilots: event.target.value})} required/></label>
            </div>
            <label className={styles.utcDateTimeLabel}>
                <span>Session time (your local time)</span>
                <input type="datetime-local" list="session-time-suggestions" value={sessionForm.time} onChange={event => onSessionFormChange({time: event.target.value})} required/>
                <datalist id="session-time-suggestions">{sessionTimeSuggestions.map(value => <option key={value} value={value}/>)}</datalist>
                <SessionTimePreview value={sessionForm.time}/>
            </label>
        </form>
    </MenteeDialog>
);

const MenteeActionConfirmation = ({action, mentee, getUserName, onCancel, onConfirm}: {
    action: MenteeStateAction;
    mentee: AdminMentee;
    getUserName: (id?: string, fallback?: string | null) => string;
    onCancel: () => void;
    onConfirm: () => void;
}) => {
    const copy = stateActionCopy[action];
    const name = getUserName(mentee.mentee, mentee.ifcName);
    const mentorId = getAssignedMentorId(mentee);
    const now = useMemo(() => Date.now(), []);
    const [headline, held] = getMentorshipStats(mentee, now);
    const nextTime = toTimestamp(getNextSession(mentee, now)?.time);
    return (
        <MenteeDialog
            size="small"
            role="alertdialog"
            titleId="mentee-action-confirmation-title"
            describedBy="mentee-action-confirmation-description"
            title={copy.title(name)}
            closeLabel="Cancel"
            onDismiss={onCancel}
            closeOnBackdrop
            footer={<>
                <button type="button" className={styles.secondaryButton} onClick={onCancel}>Cancel</button>
                <button type="button" className={styles.primaryButton} onClick={onConfirm}>{copy.confirmLabel}</button>
            </>}
        >
            <p id="mentee-action-confirmation-description" className={styles.dialogText}>{copy.description(name, mentorId ? getUserName(mentorId) : undefined)}</p>
            {action === "pass" ? (
                <ul className={styles.dialogSummary}>
                    <li>{headline.label} {headline.value} · {held.value} {held.value === "1" ? "session" : "sessions"} held</li>
                    {nextTime != null ? <li>The upcoming session on {formatShortUtcDate(nextTime)} stays booked</li> : null}
                </ul>
            ) : null}
        </MenteeDialog>
    );
};

const useMenteeDialogFocus = (onDismiss: () => void) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    const dismissRef = useRef(onDismiss);
    useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);
    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const dialog = dialogRef.current;
        const controls = () => [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter(element => element.getClientRects().length > 0);
        controls()[0]?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (!dialog?.contains(document.activeElement)) return;
            // Nested native confirmations own their own keyboard and focus behavior.
            if ((document.activeElement as HTMLElement | null)?.closest("dialog[open]")) return;
            if (event.key === "Escape") {
                event.preventDefault(); event.stopPropagation(); dismissRef.current();
            } else if (event.key === "Tab") {
                const items = controls();
                const first = items[0], last = items[items.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            if (opener?.isConnected) opener.focus();
        };
    }, []);
    return dialogRef;
};

const DetailItem = ({label, value}: {label: string; value: string}) => (
    <div className={styles.detailItem}><dt>{label}</dt><dd>{value}</dd></div>
);

const MenteeTerminationDialog = ({mentee, getUserName, reason, onReasonChange, onCancel, onConfirm, busy}: {
    mentee: AdminMentee; getUserName: (id?: string, fallback?: string | null) => string;
    reason: string; onReasonChange: (value: string) => void; onCancel: () => void; onConfirm: (event: FormEvent) => void; busy: boolean;
}) => {
    const name = getUserName(mentee.mentee, mentee.ifcName);
    const mentorId = getAssignedMentorId(mentee);
    return (
        <MenteeDialog
            size="small"
            titleId="mentee-termination-title"
            describedBy="mentee-termination-description"
            title={`Terminate ${name}?`}
            closeLabel="Cancel termination"
            onDismiss={onCancel}
            dismissDisabled={busy}
            footer={<>
                <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>Cancel</button>
                <button type="submit" form="mentee-termination-form" className={styles.dangerButton} disabled={busy}>Terminate mentee</button>
            </>}
        >
            <form id="mentee-termination-form" className={styles.dialogForm} onSubmit={onConfirm}>
                <p id="mentee-termination-description" className={styles.dialogText}>
                    This ends {name}’s {mentorId ? `mentorship with ${getUserName(mentorId)}` : "place on the waitlist"}. The reason is shown on the profile.
                </p>
                <label>Reason for termination<textarea rows={4} value={reason} onChange={event => onReasonChange(event.target.value)} required/></label>
            </form>
        </MenteeDialog>
    );
};

const MenteeProfileActionMenu = ({onTerminate, busy}: {onTerminate: () => void; busy: boolean}) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!open) return;
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        const closeOutside = (event: PointerEvent) => {
            if (!menuRef.current?.parentElement?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        return () => document.removeEventListener("pointerdown", closeOutside);
    }, [open]);
    return <div className={styles.profileActionMenu} onKeyDown={event => {
        if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
            toggleRef.current?.focus();
        }
    }}>
        <button ref={toggleRef} type="button" className={styles.profileMoreButton} aria-label="More actions" aria-haspopup="menu" aria-expanded={open} aria-controls="mentee-more-actions" onClick={() => setOpen(value => !value)}>
            <DotsThree size={20} weight="bold" aria-hidden="true"/>
        </button>
        {open ? <div ref={menuRef} id="mentee-more-actions" className={styles.profileActionPopover} role="menu" aria-label="More actions">
            <p aria-hidden="true">Mentorship</p>
            <button type="button" role="menuitem" className={styles.dangerStateAction} disabled={busy} onClick={() => {
                setOpen(false);
                // The dialog returns focus to whatever was focused when it opened, so hand that to the toggle.
                toggleRef.current?.focus();
                onTerminate();
            }}>
                <XCircle size={18} aria-hidden="true"/>
                <span>Terminate mentee…<small>Ends the mentorship with a reason</small></span>
            </button>
        </div> : null}
    </div>;
};

const timelineIcons: Record<MenteeTimelineStep["state"], typeof Circle> = {
    complete: CheckCircle,
    current: Circle,
    upcoming: Circle,
    skipped: MinusCircle,
    passed: CheckCircle,
    terminated: XCircle,
};

const isTimelineEnd = (step: MenteeTimelineStep) => step.state === "current" || step.state === "passed" || step.state === "terminated";

const describeTimelineStep = (step: MenteeTimelineStep) => {
    if (step.time != null) return formatAdminUtcDate(step.time);
    if (step.state === "upcoming") return "Not yet";
    if (step.state === "skipped") return "Skipped";
    return "Date not recorded";
};

// One headline duration per state, plus held sessions and how long the mentee waited for a mentor.
const getMentorshipStats = (mentee: AdminMentee, now: number) => {
    const waitlisted = toTimestamp(mentee.waitlistTime);
    const pickedUp = toTimestamp(mentee.pickupTime);
    const ended = toTimestamp(mentee.state === "passed" ? mentee.passedTime : mentee.terminatedTime);
    const span = (from?: number, to?: number) => from == null || to == null ? "Not recorded" : formatDayCount(daysBetween(from, to));
    const headline = mentee.state === "waitlisted"
        ? {label: "Waiting", value: span(waitlisted, now)}
        : mentee.state === "picked_up"
            ? {label: "Mentored for", value: span(pickedUp, now)}
            : mentee.state === "terminated" && pickedUp == null
                ? {label: "On waitlist for", value: span(waitlisted, ended)}
                : {label: "Mentored for", value: span(pickedUp, ended)};
    const waited = mentee.state === "waitlisted"
        ? {label: "Joined waitlist", value: waitlisted == null ? "Not recorded" : formatShortUtcDate(waitlisted)}
        : pickedUp == null
            ? {label: "Waited", value: mentee.state === "terminated" ? "Never picked up" : "Not recorded"}
            : {label: "Waited", value: span(waitlisted, pickedUp)};
    return [headline, {label: "Sessions held", value: String(countHeldSessions(mentee, now))}, waited];
};

const MenteeMentorshipProgress = ({mentee, now}: {mentee: AdminMentee; now: number}) => (
    <div className={styles.profileProgress}>
        <ol className={styles.profileTimeline} aria-label="Mentorship timeline">
            {getMenteeTimeline(mentee).map(step => {
                const Icon = timelineIcons[step.state];
                return <li key={step.key} data-state={step.state} aria-current={isTimelineEnd(step) ? "step" : undefined}>
                    <Icon size={24} weight={step.state === "upcoming" ? "regular" : "fill"} aria-hidden="true"/>
                    <strong>{step.label}</strong>
                    <span>{describeTimelineStep(step)}</span>
                </li>;
            })}
        </ol>
        <dl className={styles.profileStats}>
            {getMentorshipStats(mentee, now).map(stat => <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
            </div>)}
        </dl>
    </div>
);

interface SessionDetailsModalProps {
    session: Session;
    getUserName: (id?: string) => string;
    editable: boolean;
    readOnlyNote?: string;
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
                                 readOnlyNote,
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
    const [activeTab, setActiveTab] = useState("details");
    const tabs = ["details", "feedback", "attendees"] as const;
    const now = useMemo(() => Date.now(), []);
    const sessionEditable = editable && !session.cancelled;
    const [editForm, setEditForm] = useState(() => createSessionEditForm(session));
    const [editState, setEditState] = useState("");
    const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
    const [cancelError, setCancelError] = useState<string>();
    const cancelSessionButton = useRef<HTMLButtonElement>(null);
    const cancelConfirmationDialog = useRef<HTMLDialogElement>(null);
    const keepSessionButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        setEditForm(createSessionEditForm(session));
        setEditState("");
        setShowCancelConfirmation(false);
    }, [session]);

    useEffect(() => {
        if (!showCancelConfirmation) return;
        const dialog = cancelConfirmationDialog.current;
        dialog?.showModal();
        keepSessionButton.current?.focus();
        return () => dialog?.close();
    }, [showCancelConfirmation]);

    const dismissCancelConfirmation = () => {
        cancelConfirmationDialog.current?.close();
        setShowCancelConfirmation(false);
        cancelSessionButton.current?.focus();
    };

    const confirmCancellation = async () => {
        if (!showCancelConfirmation || !sessionEditable || busyAction) return;
        setCancelError(undefined);
        const updatedSession = await onCancelSession();
        if (updatedSession) {
            setShowCancelConfirmation(false);
        } else {
            setCancelError("The session could not be cancelled. Please try again.");
        }
    };

    const submitSessionUpdate = async (event: FormEvent) => {
        event.preventDefault();
        setEditState("Saving…");
        const updatedSession = await onUpdateSession(editForm);
        setEditState(updatedSession ? "Saved" : "");
    };

    const tabList = (
        <div className={styles.dialogTabs} role="tablist" aria-label="Session sections">
            {tabs.map(tab => (
                <button key={tab} type="button" role="tab" id={`session-${session.id}-tab-${tab}`}
                        aria-controls={`session-${session.id}-panel-${tab}`} aria-selected={activeTab === tab}
                        tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)}
                        onKeyDown={event => {
                            const index = tabs.indexOf(tab);
                            const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                                : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                                : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
                            if (next === undefined) return;
                            event.preventDefault();
                            setActiveTab(tabs[next]);
                            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
                        }}>
                    {tab === "details" ? "Details" : tab === "feedback" ? "Feedback" : `Attendees (${session.attendees.length})`}
                </button>
            ))}
        </div>
    );

    return (
        <MenteeDialog
            size="large"
            titleId={`session-details-${session.id}`}
            eyebrow={`Session #${session.id}`}
            title="Session details"
            pill={<SessionStatusPill session={session} now={now}/>}
            subtitle={<SessionTimeDisplay value={session.time}/>}
            closeLabel="Close session details"
            onDismiss={onClose}
            dismissDisabled={Boolean(busyAction)}
            tabs={tabList}
            footer={<>
                {sessionEditable && activeTab === "details" ? (
                    <button
                        ref={cancelSessionButton}
                        type="button"
                        className={styles.dangerGhostButton}
                        onClick={() => {
                            setCancelError(undefined);
                            setShowCancelConfirmation(true);
                        }}
                        disabled={Boolean(busyAction)}
                        aria-haspopup="dialog"
                        aria-controls={`cancel-session-confirmation-${session.id}`}
                    >
                        Cancel session
                    </button>
                ) : null}
                <span role="status" className={styles.dialogStatus}>{editState}</span>
                <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={Boolean(busyAction)}>Close</button>
                {sessionEditable && activeTab === "details" ? <button type="submit" form={`session-edit-${session.id}`} className={styles.primaryButton} disabled={Boolean(busyAction)}>Save changes</button> : null}
            </>}
        >
            <div role="tabpanel" id={`session-${session.id}-panel-details`} aria-labelledby={`session-${session.id}-tab-details`} hidden={activeTab !== "details"} tabIndex={0} className={styles.dialogPanel}>
                {readOnlyNote ? <p className={styles.dialogNote}>{readOnlyNote}</p> : null}
                <dl className={styles.sessionDetailsGrid} aria-label="Session summary">
                    <DetailItem label="Mentor" value={getUserName(session.mentor)}/>
                    <DetailItem label="Mentee" value={getUserName(session.mentee)}/>
                    <DetailItem label="Airport" value={session.airport || "Not set"}/>
                    <DetailItem label="Pilots" value={formatPilotCount(session)}/>
                    <DetailItem label="Assignment" value={session.hasAssignment ? "Sent" : "Not sent"}/>
                    {session.messageId ? <DetailItem label="Message ID" value={session.messageId}/> : null}
                </dl>

                {sessionEditable ? (
                    <section className={styles.sessionDetailsBlock} aria-labelledby={`session-edit-title-${session.id}`}>
                        <h3 id={`session-edit-title-${session.id}`}>Edit session</h3>
                        <form id={`session-edit-${session.id}`} className={styles.dialogForm} onSubmit={submitSessionUpdate}>
                            <div className={styles.inlineInputs}>
                                <label>
                                    Airport
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
                                    Requested pilots
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
                            </div>
                            <label className={styles.utcDateTimeLabel}>
                                <span>Session time (your local time)</span>
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
                                <SessionTimePreview value={editForm.time}/>
                            </label>
                        </form>
                    </section>
                ) : null}
            </div>
            <div role="tabpanel" id={`session-${session.id}-panel-feedback`} aria-labelledby={`session-${session.id}-tab-feedback`} hidden={activeTab !== "feedback"} tabIndex={0} className={styles.dialogPanel}>
                <SessionFeedbackPanel sessionId={session.id} outcome={session.trainingOutcome}/>
            </div>
            <div role="tabpanel" id={`session-${session.id}-panel-attendees`} aria-labelledby={`session-${session.id}-tab-attendees`} hidden={activeTab !== "attendees"} tabIndex={0} className={styles.dialogPanel}>
                <section className={styles.sessionDetailsBlock} aria-labelledby={`session-attendees-title-${session.id}`}>
                    <h3 id={`session-attendees-title-${session.id}`}>Attendees</h3>
                    {session.attendees.length === 0 ? (
                        <p className={styles.blockEmpty}>No attendees added.</p>
                    ) : (
                        <ul className={styles.attendeesList}>
                            {session.attendees.map(attendeeId => (
                                <li key={attendeeId}>
                                    <span><strong>{getUserName(attendeeId)}</strong> <small>{attendeeId}</small></span>
                                    {sessionEditable ? (
                                        <button
                                            type="button"
                                            className={styles.dangerTextButton}
                                            onClick={() => onRemoveAttendee(attendeeId)}
                                            disabled={Boolean(busyAction)}
                                            aria-label={`Remove ${getUserName(attendeeId)}`}
                                        >
                                            Remove
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {sessionEditable ? (
                    <section className={styles.sessionDetailsBlock} aria-labelledby={`session-add-attendee-${session.id}`}>
                        <h3 id={`session-add-attendee-${session.id}`}>Add attendee</h3>
                        <form className={styles.addAttendeeForm} onSubmit={onAddAttendee}>
                            <input
                                value={attendeeInput}
                                onChange={event => onAttendeeInputChange(event.target.value)}
                                placeholder="Attendee Discord ID"
                                aria-label="Attendee Discord ID"
                                required
                            />
                            <button type="submit" className={styles.secondaryButton} disabled={Boolean(busyAction)}>Add</button>
                        </form>
                    </section>
                ) : null}
            </div>

            {showCancelConfirmation ? (
                <dialog
                    ref={cancelConfirmationDialog}
                    id={`cancel-session-confirmation-${session.id}`}
                    className={styles.sessionCancelConfirmation}
                    aria-labelledby={`cancel-session-prompt-${session.id}`}
                    aria-describedby={`cancel-session-description-${session.id}`}
                    onCancel={event => {
                        event.preventDefault();
                        if (!busyAction) dismissCancelConfirmation();
                    }}
                >
                    <h3 id={`cancel-session-prompt-${session.id}`}>Cancel this session?</h3>
                    <p id={`cancel-session-description-${session.id}`}>{formatAdminUtcDate(session.time)}{session.airport ? ` at ${session.airport}` : ""} will be marked as cancelled.</p>
                    {cancelError ? <p role="alert" className={styles.dialogError}>{cancelError}</p> : null}
                    <div className={styles.dialogActions}>
                        <button
                            ref={keepSessionButton}
                            type="button"
                            className={styles.secondaryButton}
                            onClick={dismissCancelConfirmation}
                            disabled={Boolean(busyAction)}
                        >
                            Keep session
                        </button>
                        <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={confirmCancellation}
                            disabled={Boolean(busyAction)}
                        >
                            {busyAction === `cancel-${session.id}` ? "Cancelling…" : "Cancel session"}
                        </button>
                    </div>
                </dialog>
            ) : null}
        </MenteeDialog>
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
type AssignmentLoadState = "not-needed" | "loading" | "loaded" | "failed";

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
    const [assignmentLoadState, setAssignmentLoadState] = useState<AssignmentLoadState>(() => (
        existingAssignment ? "loaded" : session.hasAssignment ? "loading" : "not-needed"
    ));
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

    const isEditMode = session.hasAssignment || fetchedAssignment != null;

    useEffect(() => {
        if (!session.hasAssignment || existingAssignment) return;

        let current = true;
        ApiUtils.getSessionAssignment(token, mentee.id, session.id).then(data => {
            if (!current) return;
            if (data) {
                setFetchedAssignment(data);
                setAssignmentLoadState("loaded");
                return;
            }

            setAssignmentLoadState("failed");
            onError("Not authorized");
        }).catch(err => {
            if (!current) return;
            setAssignmentLoadState("failed");
            onError(err instanceof Error ? err.message : "Could not load assignment");
        });

        return () => {
            current = false;
        };
    }, [session.id, mentee.id, session.hasAssignment, existingAssignment, token, onError]);

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
    const messageCodePointCount = countUnicodeCodePoints(messageText.trim());

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
        if (isEditMode && (assignmentLoadState !== "loaded" || !fetchedAssignment)) return;
        if (!isEditMode && messageCodePointCount > MAX_ASSIGNMENT_CODE_POINTS) {
            setSendState("");
            onError(`Assignment content is ${messageCodePointCount} Unicode code points; the maximum is ${MAX_ASSIGNMENT_CODE_POINTS}. Shorten it before sending.`);
            return;
        }

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
                setAssignmentLoadState("loaded");
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
                setAssignmentLoadState("loaded");
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


    const overLimit = messageCodePointCount > MAX_ASSIGNMENT_CODE_POINTS;
    const sessionTime = toTimestamp(session.time);
    return (
        <MenteeDialog
            size="wide"
            titleId="assignment-modal-title"
            eyebrow={`Session #${session.id} · ${session.airport || "No airport"} · ${sessionTime == null ? "Date not set" : formatAdminUtcDate(sessionTime)}`}
            title={isEditMode ? "Edit assignment" : "Generate assignment"}
            subtitle={isEditMode ? "Already sent to the session thread. Saving updates that message." : undefined}
            closeLabel="Close assignment"
            onDismiss={onClose}
            dismissDisabled={sending}
            footer={sortedAssignments.length === 0 ? (
                <button type="button" className={styles.secondaryButton} onClick={onClose}>Close</button>
            ) : <>
                <span role="status" className={styles.dialogStatus}>{sendState || copyState}</span>
                {sentThreadUrl ? <a className={styles.dialogLink} href={sentThreadUrl} target="_blank" rel="noreferrer">Open thread</a> : null}
                <button type="button" className={styles.secondaryButton} onClick={copyText}>Copy text</button>
                <button type="button" className={styles.primaryButton} onClick={sendAssignment}
                        disabled={!selectedAssignment || !messageText.trim() || sending || (isEditMode && assignmentLoadState !== "loaded")}>
                    {isEditMode ? "Save & update" : "Send to thread"}
                </button>
            </>}
        >
            {sortedAssignments.length === 0 ? (
                <p className={styles.blockEmpty}>No active assignments are available yet.</p>
            ) : (
                <div className={styles.assignmentGeneratorStack}>
                    <div className={styles.assignmentGeneratorToolbar}>
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
                        <button type="button" className={styles.secondaryButton} onClick={autoFill}>Auto-fill</button>
                        <button type="button" className={styles.secondaryButton} onClick={clearSlots}>Clear</button>
                    </div>

                    <div className={styles.assignmentBoard}>
                        <section className={styles.attendeeTray} aria-labelledby="assignment-pool-title">
                            <div className={styles.boardHeader}>
                                <h3 id="assignment-pool-title">Unassigned attendees</h3>
                                <span>{unassignedAttendees.length}</span>
                            </div>
                            <div className={styles.attendeePool}>
                                {unassignedAttendees.length === 0 ? (
                                    <span>All attendees assigned</span>
                                ) : unassignedAttendees.map(attendeeId => (
                                    <button
                                        key={attendeeId}
                                        type="button"
                                        aria-pressed={selectedAttendeeId === attendeeId}
                                        draggable
                                        onClick={() => setSelectedAttendeeId(prev => prev === attendeeId ? undefined : attendeeId)}
                                        onDragStart={event => event.dataTransfer.setData("text/plain", String(attendeeId))}
                                    >
                                        {getUserName(attendeeId)}
                                    </button>
                                ))}
                            </div>
                            <p>Drag a name onto a slot, or tap a name and then a slot.</p>
                        </section>

                        <div className={styles.assignmentSlotBoard}>
                            {selectedAssignment?.groups.map((group, groupIndex) => (
                                <section key={`${group.name}-${groupIndex}`} className={styles.assignmentSlotGroup} aria-labelledby={`assignment-group-${groupIndex}`}>
                                    <div className={styles.boardHeader}>
                                        <h3 id={`assignment-group-${groupIndex}`}>{group.name}</h3>
                                        <span>{group.slots.length} {group.slots.length === 1 ? "slot" : "slots"}</span>
                                    </div>
                                    {group.slots.map((slot, slotIndex) => {
                                        const slotKey = getAssignmentSlotKey(slot.id, `${groupIndex}-${slotIndex}`);
                                        const assignedAttendee = slotAssignments[slotKey];
                                        return (
                                            // Tapping a slot is a pointer shortcut; the select is the keyboard path.
                                            <div
                                                key={slotKey}
                                                className={styles.assignmentSlotCard}
                                                data-selectable={selectedAttendeeId != null ? "true" : undefined}
                                                onClick={() => handleSlotClick(slotKey)}
                                                onDragOver={event => event.preventDefault()}
                                                onDrop={event => assignFromDrag(slotKey, event.dataTransfer.getData("text/plain"))}
                                            >
                                                <span className={styles.assignmentSlotText}>
                                                    <strong>{slot.label}</strong>
                                                    {slot.details ? <span>{slot.details}</span> : null}
                                                </span>
                                                <select
                                                    value={assignedAttendee ?? ""}
                                                    data-assigned={assignedAttendee != null ? "true" : undefined}
                                                    onClick={event => event.stopPropagation()}
                                                    onChange={event => assignFromSelect(slotKey, event.target.value)}
                                                    aria-label={`Assign ${slot.label}`}
                                                >
                                                    <option value="">Unassigned</option>
                                                    {sessionAttendees.map(attendeeId => (
                                                        <option key={attendeeId} value={attendeeId}>{getUserName(attendeeId)}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        );
                                    })}
                                </section>
                            ))}
                        </div>
                    </div>

                    <section className={styles.assignmentPreviewFold}>
                        <button type="button" className={styles.previewToggle} aria-expanded={previewOpen} aria-controls="assignment-preview" onClick={() => setPreviewOpen(open => !open)}>
                            <span>Message preview</span>
                            <span className={overLimit ? styles.assignmentCharacterCountExceeded : undefined} aria-live="polite">
                                {messageCodePointCount} / {MAX_ASSIGNMENT_CODE_POINTS} characters
                            </span>
                            <CaretDown size={16} aria-hidden="true" className={previewOpen ? styles.caretOpen : undefined}/>
                        </button>
                        {previewOpen ? (
                            <div id="assignment-preview" className={styles.previewBody}>
                                <label>
                                    <span className={styles.visuallyHidden}>Assignment message</span>
                                    <textarea
                                        value={messageText}
                                        onChange={event => {
                                            setPreviewText(event.target.value);
                                            setPreviewDirty(true);
                                            setCopyState("");
                                            setSendState("");
                                        }}
                                        rows={12}
                                    />
                                </label>
                                <p>Edits here replace the generated text. Changing slots regenerates it.</p>
                            </div>
                        ) : null}
                    </section>
                </div>
            )}
        </MenteeDialog>
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

    return `${session.attendees.length} of ${session.pilots}`;
};

const getMenteeSessionCount = (mentee: AdminMentee, session: Session) => {
    const sessionTime = new Date(session.time).getTime();
    const pastRunningSessions = mentee.sessions.filter(candidate => {
        if (candidate.cancelled) return false;
        return new Date(candidate.time).getTime() < sessionTime;
    });

    return pastRunningSessions.length + 1;
};

const formatNextSession = (session: Session) => {
    const time = toTimestamp(session.time);
    const date = time == null ? "Date not set" : formatShortUtcDate(time);
    return session.airport ? `${date} · ${session.airport}` : date;
};

const formatAutoMatchSummary = (candidate: AutoMatchCandidate) => {
    return candidate.overlaps ? "Overlaps availability" : `${candidate.distanceMinutes} min gap`;
};

const getAssignedMentorId = (mentee: AdminMentee) => mentee.practicalMentor;

const getMentorDisplayName = (mentee: AdminMentee, getUserName: (id?: string) => string) => {
    const mentorId = getAssignedMentorId(mentee);
    return mentorId ? getUserName(mentorId) : "None";
};

const getUserNameFromMap = (usersById: Map<string, AtcmhUser>, id: string) =>
    formatUserName(id, usersById.get(id)?.username);

export default AdminMentees;
