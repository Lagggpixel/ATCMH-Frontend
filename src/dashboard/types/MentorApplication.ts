export type MentorApplicationContextStatus =
    | "eligible"
    | "pending"
    | "approved"
    | "cooldown"
    | "link_required"
    | "not_ifatc"
    | "mentor"
    | "moderator"
    | "unavailable";

export interface MentorApplicationContext {
    status: MentorApplicationContextStatus;
    message: string;
    ifcUsername: string;
    discord: string;
    ifatcRank: string;
    superAdminBypassActive: boolean;
}

export interface MentorApplicationSubmission {
    region: string;
    timezone: string;
    availabilityOutline: string;
    leadershipRoles: string;
    whyMentor: string;
    anythingElse: string;
}

export interface MentorApplicationSummary {
    id: number;
    ifcUsername: string;
    discord: string;
    ifatcRank: string;
    region: string;
    timezone: string;
    submittedAt: string;
    status: "PENDING" | "APPROVED" | "DENIED" | "MENTOR";
    reviewedAt: string | null;
    reapplyAt: string | null;
    revision: number;
}

export interface MentorApplicationDetail extends MentorApplicationSummary {
    availabilityOutline: string;
    leadershipRoles: string;
    whyMentor: string;
    anythingElse: string;
    reviewedBy: string | null;
    decisionReason: string | null;
    waitMonths: number | null;
    previousAttempts: MentorApplicationSummary[];
    attendance?: {allTime: number; last30Days: number} | null;
}

export interface MentorApplicationPolicy {waitMonths: number; revision: number}
export interface MentorAccountSettings {
    policy: MentorApplicationPolicy;
    waitMonths: number | null;
    latestApplication: MentorApplicationSummary | null;
}

export interface MentorApplicationReceipt {
    id: number;
    submittedAt: string;
}
