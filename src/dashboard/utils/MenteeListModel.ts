import type {AdminMentee, ApiTimestamp, MenteeState} from "../types/AdminMentee.ts";
import type {Session} from "../types/Session.ts";

export type MenteeStatusFilter = "all" | MenteeState;
export type MenteeSortKey = "name" | "status" | "mentor" | "since" | "next" | "last" | "sessions";
export type MenteeSortDirection = "asc" | "desc";
export interface MenteeSort {
    key: MenteeSortKey;
    direction: MenteeSortDirection;
}

export const MENTEE_STATUS_FILTERS: {value: MenteeStatusFilter; label: string}[] = [
    {value: "all", label: "All"},
    {value: "waitlisted", label: "Waitlist"},
    {value: "picked_up", label: "Picked up"},
    {value: "passed", label: "Passed"},
    {value: "terminated", label: "Terminated"},
];

const STATE_ORDER: Record<MenteeState, number> = {waitlisted: 0, picked_up: 1, passed: 2, terminated: 3};
const DAY_MS = 86_400_000;
const shortUtcDate = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"});

export const normalizeMenteeStatusFilter = (value: string | null): MenteeStatusFilter | undefined =>
    MENTEE_STATUS_FILTERS.some(filter => filter.value === value) ? value as MenteeStatusFilter : undefined;

// Epoch zero is a real timestamp in older fixtures, so only null, blank and invalid values are missing.
export const toTimestamp = (value?: ApiTimestamp | null): number | undefined => {
    if (value == null || value === "") return undefined;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? undefined : time;
};

export const formatShortUtcDate = (time: number) => shortUtcDate.format(new Date(time));

export const countMenteesByStatus = (mentees: AdminMentee[]): Record<MenteeStatusFilter, number> => {
    const counts: Record<MenteeStatusFilter, number> = {all: mentees.length, waitlisted: 0, picked_up: 0, passed: 0, terminated: 0};
    for (const mentee of mentees) counts[mentee.state] += 1;
    return counts;
};

export const getStatusSinceTime = (mentee: AdminMentee) => {
    switch (mentee.state) {
        case "waitlisted": return toTimestamp(mentee.waitlistTime);
        case "picked_up": return toTimestamp(mentee.pickupTime);
        case "passed": return toTimestamp(mentee.passedTime);
        case "terminated": return toTimestamp(mentee.terminatedTime);
    }
};

const activeSessions = (mentee: AdminMentee) => mentee.sessions
    .filter(session => !session.cancelled)
    .map(session => ({session, time: toTimestamp(session.time)}))
    .filter((entry): entry is {session: Session; time: number} => entry.time != null);

export const getNextSession = (mentee: AdminMentee, now: number): Session | undefined => activeSessions(mentee)
    .filter(entry => entry.time >= now)
    .sort((a, b) => a.time - b.time)[0]?.session;

export const getLastSession = (mentee: AdminMentee, now: number): Session | undefined => activeSessions(mentee)
    .filter(entry => entry.time < now)
    .sort((a, b) => b.time - a.time)[0]?.session;

export const countHeldSessions = (mentee: AdminMentee, now: number) => activeSessions(mentee)
    .filter(entry => entry.time < now && entry.session.trainingOutcome !== "NOT_HELD").length;

export const daysBetween = (from: number, to: number) => Math.max(0, Math.floor((to - from) / DAY_MS));
export const formatDayCount = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

export const formatDaysAgo = (time: number, now: number) => {
    const days = daysBetween(time, now);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
};

export const describeMenteeSince = (mentee: AdminMentee, now: number) => {
    const time = getStatusSinceTime(mentee);
    if (mentee.state === "waitlisted") return time == null ? "Waiting" : `Waiting ${formatDayCount(daysBetween(time, now))}`;
    if (time == null) return "Date not recorded";
    const label = mentee.state === "picked_up" ? "Since" : mentee.state === "passed" ? "Passed" : "Ended";
    return `${label} ${formatShortUtcDate(time)}`;
};

export const defaultMenteeSort = (status: MenteeStatusFilter): MenteeSort | undefined =>
    status === "waitlisted" ? {key: "since", direction: "asc"} : undefined;

interface SortContext {
    now: number;
    getName: (mentee: AdminMentee) => string;
    getMentorName: (mentee: AdminMentee) => string | undefined;
}

const sortValue = (mentee: AdminMentee, key: MenteeSortKey, context: SortContext): string | number | undefined => {
    switch (key) {
        case "name": return context.getName(mentee).toLocaleLowerCase();
        case "status": return STATE_ORDER[mentee.state];
        case "mentor": return context.getMentorName(mentee)?.toLocaleLowerCase();
        case "since": return getStatusSinceTime(mentee);
        case "next": return toTimestamp(getNextSession(mentee, context.now)?.time);
        case "last": return toTimestamp(getLastSession(mentee, context.now)?.time);
        case "sessions": return mentee.sessions.length;
    }
};

// Missing values always sort last so an ascending "Next session" puts the soonest booking first.
export const sortMentees = (mentees: AdminMentee[], sort: MenteeSort | undefined, context: SortContext) => {
    if (!sort) return mentees;
    const factor = sort.direction === "asc" ? 1 : -1;
    return mentees
        .map((mentee, index) => ({mentee, index, value: sortValue(mentee, sort.key, context)}))
        .sort((a, b) => {
            if (a.value === b.value) return a.index - b.index;
            if (a.value == null) return 1;
            if (b.value == null) return -1;
            const compared = typeof a.value === "string" && typeof b.value === "string"
                ? a.value.localeCompare(b.value)
                : Number(a.value) - Number(b.value);
            return compared === 0 ? a.index - b.index : compared * factor;
        })
        .map(entry => entry.mentee);
};

export const nextMenteeSort = (current: MenteeSort | undefined, key: MenteeSortKey): MenteeSort =>
    current?.key === key ? {key, direction: current.direction === "asc" ? "desc" : "asc"} : {key, direction: "asc"};
