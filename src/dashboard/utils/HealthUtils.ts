import type {AdminUser} from "../types/AdminUser.ts";
import type {HealthJob} from "../types/BotHealth.ts";

export function canViewHealth(user: Pick<AdminUser, "role"> | undefined): boolean {
    return user?.role === "admin" || user?.role === "super_admin";
}

export function needsAttention(job: HealthJob): boolean {
    return job.state === "FAILED" || job.overdue;
}

export function filterHealthJobs(jobs: HealthJob[], query: string, attentionOnly: boolean): HealthJob[] {
    const search = query.trim().toLowerCase();
    return jobs.filter(job => (!attentionOnly || needsAttention(job))
        && `${job.name} ${job.state} ${job.disabledReason ?? ""} ${job.failureReference ?? ""}`.toLowerCase().includes(search));
}

export function healthLabel(value: string): string {
    const text = value.toLowerCase().replaceAll("_", " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function healthUptime(seconds: number): string {
    const value = Math.max(0, Math.floor(seconds));
    return `${Math.floor(value / 86400)}d ${Math.floor(value % 86400 / 3600)}h ${Math.floor(value % 3600 / 60)}m`;
}

export const jobDescriptions: Record<string, string> = {
    "session-post-colors": "Checks historical session embed colors; retries failed updates.",
    "session-announcements": "Posts scheduled session requests to Discord.",
    "session-reminders": "Sends session reminders to participants.",
    "statistics": "Refreshes community statistics.",
    "pagination-cleanup": "Clears expired Discord pagination state.",
    "upcoming-session-messages": "Refreshes scheduled session summaries.",
    "leaderboard-messages": "Updates stored leaderboard messages.",
    "mentee-check-ins": "Checks eligibility for moderator check-in alerts.",
    "mentee-attendance-alerts": "Checks mentee attendance deficit alerts.",
    "discord-accounts": "Reconciles linked Discord accounts.",
    "leaderboard-roles": "Updates the top attendee role.",
    "controlling-feed": "Fetches and posts controlling feed updates.",
    "role-update-processing": "Processes queued role updates.",
    "notify-dms": "Delivers queued direct-message notifications.",
    "database-backup": "Creates the daily database backup.",
};
