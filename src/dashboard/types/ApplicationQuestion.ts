export type ApplicationType = "mentor" | "written" | "mock";

export type ApplicationQuestionInputType =
    | "YES_NO"
    | "TEXT"
    | "POSITIVE_INTEGER"
    | "WEEKLY_AVAILABILITY";

export interface ApplicationQuestion {
    key: string;
    prompt: string;
    helpText: string | null;
    inputType: ApplicationQuestionInputType;
    sortOrder: number;
    active: boolean;
    dependsOnKey: string | null;
    dependsOnValue: string | null;
}

export type ApplicationQuestionUpdate = Pick<ApplicationQuestion,
    "prompt" | "helpText" | "sortOrder" | "active">;

export type WebsiteApplicationStatus =
    | "IFC_REQUIRED"
    | "READY"
    | "DRAFT"
    | "ACTIVE_MENTORSHIP"
    | "SUBMITTING"
    | "SUBMITTED"
    | "DELIVERY_FAILED";

export interface WebsiteApplicationState {
    applicationType: ApplicationType;
    status: WebsiteApplicationStatus;
    answers: Record<string, string>;
    superAdminBypassActive: boolean;
    applicationId?: string | number | null;
    version?: number | null;
    links?: {
        discordLinked: boolean;
        ifcLinked: boolean;
    };
}

export interface DiscordRestartResult {
    status: "RESTART_DISCORD";
    discordUrl: string | null;
    message: string;
}
