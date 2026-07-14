"use client";

import {usePathname} from "next/navigation";
import {Navigate, DashboardNavigationProvider} from "./next-navigation";
import {resolveDashboardRoute} from "./route-map";
import {useDashboard} from "./DashboardProvider";
import AdminSessions from "./components/admin/AdminSessions";
import AdminStats from "./components/admin/AdminStats";
import AdminUserNotes from "./components/admin/AdminUserNotes";
import AdminMentees from "./components/admin/AdminMentees";
import AdminAssignments from "./components/admin/AdminAssignments";
import AdminAuditLogs from "./components/admin/AdminAuditLogs";
import AdminAssignmentGuide from "./components/admin/AdminAssignmentGuide";
import AdminManual from "./components/admin/AdminManual";
import ExamCenter from "./components/admin/ExamCenter";
import AdminAccounts from "./components/admin/AdminAccounts";
import AdminAltAccounts from "./components/admin/AdminAltAccounts";
import DashboardWorkspace from "./DashboardWorkspace";

const screenLabels = {
    sessions: "Sessions",
    stats: "Statistics",
    usernotes: "User notes",
    mentees: "Mentees",
    assignments: "Assignments",
    "assignment-guide": "Assignments guide",
    manual: "Mentor manual",
    "audit-logs": "Audit logs",
    accounts: "Accounts",
    "alt-accounts": "Alt-account evidence",
    exams: "Exam Center",
} as const;

export default function DashboardRoute() {
    const route = resolveDashboardRoute(usePathname());
    const state = useDashboard();
    if (route.screen === "redirect") return <Navigate to={route.destination} replace/>;
    if (route.screen === "not-found") return <main><h1>Dashboard page not found</h1></main>;
    const common = {loaded: state.loaded, loggedIn: state.token != null, error: state.error, adminUser: state.adminUser};
    let content;
    switch (route.screen) {
        case "sessions": content = <AdminSessions {...common} users={state.users} sessions={state.sessions}/>; break;
        case "stats": content = <AdminStats {...common} users={state.users} sessions={state.sessions}/>; break;
        case "usernotes": content = <AdminUserNotes {...common} users={state.users} userNotes={state.userNotes} token={state.token} onUserNoteChanged={state.onUserNoteChanged}/>; break;
        case "mentees": content = <AdminMentees {...common} users={state.users} mentees={state.mentees} sessions={state.sessions} userNotes={state.userNotes} assignments={state.assignments} token={state.token} onMenteeChanged={state.onMenteeChanged} onSessionChanged={state.onSessionChanged} onSessionAssignmentSaved={state.onSessionAssignmentSaved}/>; break;
        case "assignments": content = <AdminAssignments {...common} users={state.users} assignments={state.assignments} token={state.token} onAssignmentChanged={state.onAssignmentChanged} onAssignmentDeleted={state.onAssignmentDeleted}/>; break;
        case "assignment-guide": content = <AdminAssignmentGuide {...common}/>; break;
        case "manual": content = <AdminManual {...common} token={state.token}/>; break;
        case "audit-logs": content = <AdminAuditLogs {...common} users={state.users} token={state.token}/>; break;
        case "accounts": content = <AdminAccounts csrfToken={state.token} adminUser={state.adminUser} loaded={state.loaded} onSessionChanged={state.auth.refresh}/>; break;
        case "alt-accounts": content = <AdminAltAccounts csrfToken={state.token} adminUser={state.adminUser} loaded={state.loaded}/>; break;
        case "exams": content = <ExamCenter token={state.token} users={state.users ?? []} view={route.view}/>; break;
    }
    return <DashboardNavigationProvider params={"params" in route ? route.params : undefined}>
        <DashboardWorkspace adminUser={state.loaded ? state.adminUser : undefined} label={screenLabels[route.screen]}>
            {content}
        </DashboardWorkspace>
    </DashboardNavigationProvider>;
}
