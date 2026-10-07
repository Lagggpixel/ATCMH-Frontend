export type JobState = "NEVER_RUN" | "RUNNING" | "HEALTHY" | "FAILED" | "DISABLED";

export interface HealthJob {
    name: string;
    state: JobState;
    started?: string | null;
    completed?: string | null;
    lastSuccess?: string | null;
    nextRun?: string | null;
    failureReference?: string | null;
    disabledReason?: string | null;
    overdue: boolean;
}

export interface HealthDependency {
    name: string;
    kind: "role" | "channel" | "connection";
    id: string;
    problems: string[];
}

export interface BotHealth {
    status: "OPERATIONAL" | "NEEDS_ATTENTION" | "UNAVAILABLE";
    checkedAt: string;
    backendVersion: string;
    frontendVersion: string;
    startedAt?: string | null;
    uptimeSeconds: number;
    discordStatus: string;
    gatewayLatencyMs: number;
    databaseStatus: string;
    jobs: HealthJob[];
    dependencies: HealthDependency[];
}
