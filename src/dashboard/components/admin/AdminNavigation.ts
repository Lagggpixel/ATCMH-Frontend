import type {AdminUser} from "../../types/AdminUser.ts";

export interface AdminNavigationItem {
    path: string;
    label: string;
}

export interface AdminNavigationGroup {
    label: string;
    items: AdminNavigationItem[];
}

export const adminNavigationGroups = (adminUser: AdminUser | undefined, examCenterEnabled: boolean): AdminNavigationGroup[] => [
    {
        label: "Mentorship",
        items: [
            {path: "/dashboard/mentees", label: "Mentees"},
            {path: "/dashboard/assignments", label: "Assignments"},
            {path: "/dashboard/sessions", label: "Sessions"},
            {path: "/dashboard/usernotes", label: "User Notes"},
            {path: "/dashboard/manual", label: "Mentor Manual"},
        ],
    },
    {
        label: "Assessment",
        items: [
            ...(adminUser?.canManageMockQuestions ? [{path: "/dashboard/mock-questions", label: "Mock Questions"}] : []),
            ...(adminUser?.canManageApplicationQuestions ? [{path: "/dashboard/application-questions", label: "Application Questions"}] : []),
            ...(examCenterEnabled ? [{path: "/dashboard/exams", label: "Exam Center"}] : []),
        ],
    },
    {
        label: "Administration",
        items: [
            {path: "/dashboard/stats", label: "Statistics"},
            ...(adminUser?.canManageAccounts ? [{path: "/dashboard/accounts", label: "Accounts"}] : []),
            ...(adminUser?.canReviewAltAccounts ? [{path: "/dashboard/alt-accounts", label: "Alternative Evidence"}] : []),
            ...(adminUser?.canViewAuditLogs ? [{path: "/dashboard/audit-logs", label: "Audit Logs"}] : []),
        ],
    },
].filter(group => group.items.length > 0);

export const adminNavigationItems = (adminUser: AdminUser | undefined, examCenterEnabled: boolean) =>
    adminNavigationGroups(adminUser, examCenterEnabled).flatMap(group => group.items);
