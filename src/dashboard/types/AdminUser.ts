export interface AdminUser {
    id: string;
    username: string;
    role?: "super_admin" | "admin" | "staff";
    canViewIpAddresses?: boolean;
    canManageAllAssignments: boolean;
    canViewAuditLogs: boolean;
    canViewManual: boolean;
    canManageAccounts: boolean;
    canReviewAltAccounts: boolean;
    canViewSensitiveAuditDetails: boolean;
    canImpersonate: boolean;
    canManageMockQuestions?: boolean;
    canManageApplicationQuestions?: boolean;
}
