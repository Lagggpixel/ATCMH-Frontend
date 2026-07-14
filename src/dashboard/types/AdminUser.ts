export interface AdminUser {
    id: string;
    username: string;
    canManageAllAssignments: boolean;
    canViewAuditLogs: boolean;
    canViewManual: boolean;
    canManageAccounts: boolean;
    canReviewAltAccounts: boolean;
    canViewSensitiveAuditDetails: boolean;
    canImpersonate: boolean;
}
