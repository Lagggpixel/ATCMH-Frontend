"use client";

import {createContext, type ReactNode, useContext, useEffect, useState} from "react";
import type {AtcmhUser} from "./types/AtcmhUser";
import type {Session} from "./types/Session";
import type {UserNote} from "./types/UserNote";
import type {AdminMentee} from "./types/AdminMentee";
import type {AdminUser} from "./types/AdminUser";
import type {AdminAssignment} from "./types/AdminAssignment";
import type {DashboardAuthSession} from "./types/Account";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {ApiUtils, configureDashboardApiUrl} from "./utils/ApiUtils";
import {resolveAdminUserForSession, type SessionBoundAdminUser} from "./utils/AdminSessionUtils";
import {
    markMenteeSessionHasAssignment, markSessionHasAssignment, removeAssignment, upsertAssignment,
    upsertMentee, upsertMenteeSession, upsertSession, upsertUserNote,
} from "./utils/AdminStateUpdates";
import ImpersonationBanner from "./components/account/ImpersonationBanner";
import "./index.css";

interface DashboardContextValue {
    auth: {session: DashboardAuthSession | null; loading: boolean; error: string | null; refresh: () => Promise<void>; logout: (all?: boolean) => Promise<void>};
    token: string | null;
    loaded: boolean;
    error?: string;
    users?: AtcmhUser[];
    sessions?: Session[];
    userNotes?: UserNote[];
    mentees?: AdminMentee[];
    adminUser?: AdminUser;
    assignments?: AdminAssignment[];
    onUserNoteChanged: (note: UserNote) => void;
    onMenteeChanged: (mentee: AdminMentee) => void;
    onSessionChanged: (menteeRecordId: number, session: Session) => void;
    onSessionAssignmentSaved: (menteeRecordId: number, sessionId: number) => void;
    onAssignmentChanged: (assignment: AdminAssignment) => void;
    onAssignmentDeleted: (assignmentId: number) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard() {
    const value = useContext(DashboardContext);
    if (!value) throw new Error("DashboardProvider is required");
    return value;
}

export default function DashboardProvider({dashboardApiUrl, children}: {dashboardApiUrl: string; children: ReactNode}) {
    configureDashboardApiUrl(dashboardApiUrl);
    const auth = usePortalAuth();
    const token = auth.session?.csrfToken ?? null;
    const [loaded, setLoaded] = useState(false);
    const [users, setUsers] = useState<AtcmhUser[]>();
    const [sessions, setSessions] = useState<Session[]>();
    const [userNotes, setUserNotes] = useState<UserNote[]>();
    const [mentees, setMentees] = useState<AdminMentee[]>();
    const [authorizedAdminUser, setAuthorizedAdminUser] = useState<SessionBoundAdminUser>();
    const [assignments, setAssignments] = useState<AdminAssignment[]>();
    const [error, setError] = useState<string>();
    const adminUser = resolveAdminUserForSession(authorizedAdminUser, token);

    useEffect(() => {
        let current = true;
        setLoaded(false);
        setError(undefined);
        if (auth.loading) return () => { current = false; };
        if (!token) {
            setSessions(undefined); setUserNotes(undefined); setMentees(undefined); setAuthorizedAdminUser(undefined); setAssignments(undefined);
        }
        void (async () => {
            try {
                const publicUsers = await ApiUtils.getAtcmhUsers();
                if (current) setUsers(publicUsers);
                if (token && auth.adminUser) {
                        if (current) setAuthorizedAdminUser({token, user: auth.adminUser});
                        const [nextSessions, nextNotes, nextMentees, nextAssignments] = await Promise.all([
                            ApiUtils.getSessions(token), ApiUtils.getUserNotes(token), ApiUtils.getMentees(token), ApiUtils.getAssignments(token),
                        ]);
                        if (current) { setSessions(nextSessions); setUserNotes(nextNotes); setMentees(nextMentees); setAssignments(nextAssignments); }
                } else if (current) setAuthorizedAdminUser(undefined);
            } catch (reason) {
                if (current) setError(reason instanceof Error ? reason.message : String(reason));
            } finally {
                if (current) setLoaded(true);
            }
        })();
        return () => { current = false; };
    }, [auth.adminUser, auth.loading, token]);

    const value: DashboardContextValue = {
        auth, token, loaded, error, users, sessions, userNotes, mentees, adminUser, assignments,
        onUserNoteChanged: note => setUserNotes(current => upsertUserNote(current, note)),
        onMenteeChanged: mentee => setMentees(current => upsertMentee(current, mentee)),
        onSessionChanged: (menteeRecordId, session) => {
            setSessions(current => upsertSession(current, session));
            setMentees(current => upsertMenteeSession(current, menteeRecordId, session));
        },
        onSessionAssignmentSaved: (menteeRecordId, sessionId) => {
            setSessions(current => markSessionHasAssignment(current, sessionId));
            setMentees(current => markMenteeSessionHasAssignment(current, menteeRecordId, sessionId));
        },
        onAssignmentChanged: assignment => setAssignments(current => upsertAssignment(current, assignment)),
        onAssignmentDeleted: assignmentId => setAssignments(current => removeAssignment(current, assignmentId)),
    };

    return <DashboardContext.Provider value={value}>
        <div className="dashboard-product">
            {auth.session?.impersonating ? <ImpersonationBanner accountId={auth.session.accountId} onExit={() => auth.logout(false)}/> : null}
            {children}
        </div>
    </DashboardContext.Provider>;
}
