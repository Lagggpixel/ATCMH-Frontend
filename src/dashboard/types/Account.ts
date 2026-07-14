export type IdentityProvider = "discord" | "ifc";

export interface AccountIdentity {
    id?: string;
    accountId?: string;
    provider: IdentityProvider | Uppercase<IdentityProvider>;
    subject: string;
    providerSubject?: string;
    displayName?: string | null;
    active?: boolean;
    createdAt?: string;
    archivedAt?: string | null;
}

export interface DashboardAuthSession {
    accountId: string;
    status?: AccountSummary["status"];
    application: "dashboard";
    expiresAt: string;
    csrfToken: string;
    impersonating: boolean;
    identities: AccountIdentity[];
}

export interface AccountSummary {
    id: string;
    status: "ACTIVE" | "SUSPENDED" | "DELETED" | "MERGED";
    suspendedUntil?: string | null;
    suspensionReason?: string | null;
    mergeTargetAccountId?: string | null;
    version: number;
    createdAt: string;
    updatedAt: string;
    identities: AccountIdentity[];
}

export interface AccountDetail extends AccountSummary {
    sessions: Record<string, unknown>[];
    linkHistory: Record<string, unknown>[];
    loginHistory: Record<string, unknown>[];
    managementAudits: Record<string, unknown>[];
}

export type AdminOperation = "LINK" | "REASSIGN" | "UNLINK" | "MERGE" | "SUSPEND" |
    "RESTORE" | "DELETE" | "LOGOUT_ALL" | "IMPERSONATE_DASHBOARD" | "IMPERSONATE_EXAMS";

export interface AdminMutationRequest {
    operation: AdminOperation;
    sourceAccountId: string;
    targetAccountId?: string | null;
    parameters: Record<string, string>;
}

export interface AdminMutationPreview extends AdminMutationRequest {
    token: string;
    sourceVersion: number;
    targetVersion?: number | null;
    expiresAt: string;
}

export interface AdminMutationResult {
    operation: AdminOperation;
    sourceAccountId: string;
    targetAccountId?: string | null;
    handoffCode?: string | null;
    expiresAt?: string | null;
    committedAt: string;
}

export interface AltAccountCandidate {
    evidenceType: "SHARED_IP" | "OWNERSHIP_CONFLICT";
    accounts: string[];
    ip?: string;
    provider?: string;
    subject?: string;
    firstSeen: string;
    lastSeen: string;
    count: number;
}

export interface AltSuppression {
    id: string;
    type: "ACCOUNT_IP" | "GLOBAL_VPN";
    accountId?: string | null;
    signal: string;
    reason: string;
    createdAt: string;
    reversedAt?: string | null;
}
