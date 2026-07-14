import type {AdminAssignment} from "../types/AdminAssignment.ts";
import type {AdminMentee} from "../types/AdminMentee.ts";
import type {Session} from "../types/Session.ts";
import type {UserNote} from "../types/UserNote.ts";

type Identified = { id: number };

export const upsertById = <T extends Identified>(items: T[] | undefined, item: T): T[] => {
    const current = items ?? [];
    const existingIndex = current.findIndex(candidate => candidate.id === item.id);
    if (existingIndex === -1) {
        return [...current, item];
    }

    return current.map(candidate => candidate.id === item.id ? item : candidate);
};

export const removeById = <T extends Identified>(items: T[] | undefined, id: number): T[] => {
    return (items ?? []).filter(item => item.id !== id);
};

export const upsertMentee = (mentees: AdminMentee[] | undefined, mentee: AdminMentee): AdminMentee[] => {
    return upsertById(mentees, mentee);
};

export const upsertUserNote = (notes: UserNote[] | undefined, note: UserNote): UserNote[] => {
    return upsertById(notes, note);
};

export const upsertAssignment = (assignments: AdminAssignment[] | undefined, assignment: AdminAssignment): AdminAssignment[] => {
    return upsertById(assignments, assignment);
};

export const removeAssignment = (assignments: AdminAssignment[] | undefined, assignmentId: number): AdminAssignment[] => {
    return removeById(assignments, assignmentId);
};

export const upsertSession = (sessions: Session[] | undefined, session: Session): Session[] => {
    return upsertById(sessions, session);
};

export const upsertMenteeSession = (
    mentees: AdminMentee[] | undefined,
    menteeRecordId: number,
    session: Session
): AdminMentee[] => {
    return (mentees ?? []).map(mentee => {
        if (mentee.id !== menteeRecordId) {
            return mentee;
        }

        return {
            ...mentee,
            sessions: upsertSession(mentee.sessions, session),
        };
    });
};

export const markSessionHasAssignment = (
    sessions: Session[] | undefined,
    sessionId: number
): Session[] => {
    return (sessions ?? []).map(session => session.id === sessionId ? {...session, hasAssignment: true} : session);
};

export const markMenteeSessionHasAssignment = (
    mentees: AdminMentee[] | undefined,
    menteeRecordId: number,
    sessionId: number
): AdminMentee[] => {
    return (mentees ?? []).map(mentee => {
        if (mentee.id !== menteeRecordId) {
            return mentee;
        }

        return {
            ...mentee,
            sessions: mentee.sessions.map(session => session.id === sessionId ? {...session, hasAssignment: true} : session),
        };
    });
};
