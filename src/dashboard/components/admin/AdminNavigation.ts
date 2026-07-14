import type {AdminUser} from "../../types/AdminUser.ts";

const baseItems = [
    {path: "/dashboard/mentees", label: "Mentees"}, {path: "/dashboard/assignments", label: "Assignments"},
    {path: "/dashboard/sessions", label: "Sessions"}, {path: "/dashboard/usernotes", label: "User Notes"},
    {path: "/dashboard/stats", label: "Statistics"}, {path: "/dashboard/manual", label: "Manual"},
];
export const adminNavigationItems = (adminUser: AdminUser | undefined, examCenterEnabled: boolean) => [
    ...baseItems,
    ...(examCenterEnabled ? [{path: "/dashboard/exams", label: "Exam Center"}] : []),
    ...(adminUser?.canViewAuditLogs ? [{path: "/dashboard/audit-logs", label: "Audit Logs"}] : []),
    ...(adminUser?.canManageAccounts ? [{path: "/dashboard/accounts", label: "Accounts"}] : []),
    ...(adminUser?.canReviewAltAccounts ? [{path: "/dashboard/alt-accounts", label: "Alt Evidence"}] : []),
];
