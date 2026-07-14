import type {AtcmhUser} from "../types/AtcmhUser.ts";
import type {Session} from "../types/Session.ts";
import type {UserNote} from "../types/UserNote.ts";
import type {AdminMentee} from "../types/AdminMentee.ts";
import type {AdminUser} from "../types/AdminUser.ts";
import type {AdminAssignment, AdminAssignmentPayload} from "../types/AdminAssignment.ts";
import type {AuditLog, AuditLogFilterMetadata} from "../types/AuditLog.ts";
import type {AdminManual} from "../types/AdminManual.ts";
import type {SessionAssignment} from "../types/SessionAssignment.ts";
import type {
    AccountDetail,
    AccountSummary,
    AdminMutationPreview,
    AdminMutationRequest,
    AdminMutationResult,
    AltAccountCandidate,
    AltSuppression,
    DashboardAuthSession,
} from "../types/Account.ts";
import type {PolicyConsentContext} from "../types/PolicyConsent.ts";

let dashboardApiUrl = "https://dashboard-api.atcmh.org";

export function configureDashboardApiUrl(value: string) {
    dashboardApiUrl = value.replace(/\/$/, "");
}

export type AdminUserAuthResult =
    | {status: "authorized"; user: AdminUser}
    | {status: "unauthenticated"}
    | {status: "forbidden"};

export class ApiUtils {

    static get apiOrigin() { return dashboardApiUrl; }

    static async getAuthSession(): Promise<DashboardAuthSession | null> {
        const response = await fetch(`${dashboardApiUrl}/auth/me`, {credentials: "include"});
        if (response.status === 401) return null;
        await ApiUtils.ensureOk(response);
        const session = await ApiUtils.parseJson<DashboardAuthSession & {status?: string}>(response) as DashboardAuthSession & {status?: string};
        return {...session, status: session.status ? session.status.toUpperCase() as DashboardAuthSession["status"] : undefined};
    }

    static async getConsentContext(): Promise<PolicyConsentContext | null> {
        const response = await fetch(`${dashboardApiUrl}/auth/consent/context`, {
            credentials: "include",
            cache: "no-store",
        });
        if (response.status === 400 || response.status === 404 || response.status === 410) return null;
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson<PolicyConsentContext>(response) ?? null;
    }

    static async logout(csrfToken: string, all = false): Promise<void> {
        const response = await fetch(`${dashboardApiUrl}/auth/${all ? "logout-all" : "logout"}`, {
            method: "POST",
            credentials: "include",
            headers: {"X-CSRF-Token": csrfToken},
        });
        await ApiUtils.ensureOk(response);
    }

    static async searchAccounts(csrfToken: string, filters: Record<string, string>): Promise<AccountSummary[]> {
        const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value.trim()));
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/accounts?${query}`, csrfToken);
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson<AccountSummary[]>(response) ?? [];
    }

    static async getAccount(csrfToken: string, accountId: string): Promise<AccountDetail> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/accounts/${encodeURIComponent(accountId)}`, csrfToken);
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson<AccountDetail>(response) as AccountDetail;
    }

    static async previewAccountMutation(csrfToken: string, mutation: AdminMutationRequest): Promise<AdminMutationPreview> {
        return await ApiUtils.centralAdminJson<AdminMutationPreview>(`${dashboardApiUrl}/admin/accounts/mutations/preview`, csrfToken, {
            method: "POST", body: JSON.stringify(mutation),
        }) as AdminMutationPreview;
    }

    static async commitAccountMutation(csrfToken: string, previewToken: string, reason: string): Promise<AdminMutationResult> {
        return await ApiUtils.centralAdminJson<AdminMutationResult>(`${dashboardApiUrl}/admin/accounts/mutations/commit`, csrfToken, {
            method: "POST", body: JSON.stringify({previewToken, reason}),
        }) as AdminMutationResult;
    }

    static async getAltAccounts(csrfToken: string): Promise<{candidates: AltAccountCandidate[]; suppressions: AltSuppression[]}> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/alt-accounts`, csrfToken);
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson(response) as {candidates: AltAccountCandidate[]; suppressions: AltSuppression[]};
    }

    static async suppressAltSignal(csrfToken: string, kind: "detach" | "vpn", body: {accountId?: string; ip: string; reason: string}): Promise<void> {
        await ApiUtils.centralAdminJson(`${dashboardApiUrl}/admin/alt-accounts/${kind}`, csrfToken, {method: "POST", body: JSON.stringify(body)});
    }

    static async reverseAltSuppression(csrfToken: string, id: string, reason: string): Promise<void> {
        await ApiUtils.centralAdminJson(`${dashboardApiUrl}/admin/alt-accounts/suppressions/${encodeURIComponent(id)}/reverse`, csrfToken, {method: "POST", body: JSON.stringify({reason})});
    }


    static async getAtcmhUsers(): Promise<AtcmhUser[] | undefined> {

        const response = await fetch(`${dashboardApiUrl}/users`, {credentials: "include"});

        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<AtcmhUser[]>(response);
    }

    static async getSessions(token: string | null): Promise<Session[] | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/sessions`, token);

        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<Session[]>(response);
    }

    static async getUserNotes(token: string | null): Promise<UserNote[] | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/notes`, token);

        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<UserNote[]>(response);
    }

    static async createUserNote(token: string | null, userId: string, note: string): Promise<UserNote | undefined> {
        return ApiUtils.adminJson<UserNote>(`${dashboardApiUrl}/admin/notes`, token, {
            method: "POST",
            body: JSON.stringify({userId, note})
        });
    }

    static async updateUserNote(token: string | null, noteId: number, note: string): Promise<UserNote | undefined> {
        return ApiUtils.adminJson<UserNote>(`${dashboardApiUrl}/admin/notes/${noteId}`, token, {
            method: "PUT",
            body: JSON.stringify({note})
        });
    }

    static async activateUserNote(token: string | null, noteId: number): Promise<UserNote | undefined> {
        return ApiUtils.adminJson<UserNote>(`${dashboardApiUrl}/admin/notes/${noteId}/activate`, token, {
            method: "POST"
        });
    }

    static async deactivateUserNote(token: string | null, noteId: number): Promise<UserNote | undefined> {
        return ApiUtils.adminJson<UserNote>(`${dashboardApiUrl}/admin/notes/${noteId}/deactivate`, token, {
            method: "POST"
        });
    }

    static async getAdminUser(token: string | null): Promise<AdminUserAuthResult> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/me`, token);

        if (response.status === 401) {
            return {status: "unauthenticated"};
        }

        if (response.status === 403) {
            return {status: "forbidden"};
        }

        await ApiUtils.ensureOk(response);
        return {status: "authorized", user: await ApiUtils.parseJson<AdminUser>(response) as AdminUser};
    }

    static async getMentees(token: string | null): Promise<AdminMentee[] | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/mentees`, token);

        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<AdminMentee[]>(response);
    }

    static async getAssignments(token: string | null): Promise<AdminAssignment[] | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/assignments`, token);

        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<AdminAssignment[]>(response);
    }

    static async getAuditLogs(token: string | null, filters: Record<string, string> = {}): Promise<AuditLog[] | undefined> {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value.trim()) {
                params.set(key, value.trim());
            }
        });

        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/audit-logs${params.size ? `?${params.toString()}` : ""}`, token);

        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<AuditLog[]>(response);
    }

    static async getAuditLogFilters(token: string | null): Promise<AuditLogFilterMetadata | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/audit-log-filters`, token);

        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<AuditLogFilterMetadata>(response);
    }

    static async getAdminManualMeta(token: string | null): Promise<AdminManual | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/manual/meta`, token);

        if (response.status === 404) {
            return undefined;
        }

        if (ApiUtils.isUnauthorized(response)) {
            throw new Error("You are not authorized to view the manual.");
        }

        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<AdminManual>(response);
    }

    static async getAdminManualPdf(token: string | null): Promise<Blob | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/manual/pdf`, token);

        if (response.status === 404) {
            return undefined;
        }

        if (ApiUtils.isUnauthorized(response)) {
            throw new Error("You are not authorized to view the manual PDF.");
        }

        await ApiUtils.ensureOk(response);
        return response.blob();
    }

    static async createAssignment(token: string | null, payload: AdminAssignmentPayload): Promise<AdminAssignment | undefined> {
        return ApiUtils.adminJson<AdminAssignment>(`${dashboardApiUrl}/admin/assignments`, token, {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    static async updateAssignment(token: string | null, assignmentId: number, payload: AdminAssignmentPayload): Promise<AdminAssignment | undefined> {
        return ApiUtils.adminJson<AdminAssignment>(`${dashboardApiUrl}/admin/assignments/${assignmentId}`, token, {
            method: "PUT",
            body: JSON.stringify(payload),
        });
    }

    static async deleteAssignment(token: string | null, assignmentId: number): Promise<void> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/assignments/${assignmentId}`, token, {
            method: "DELETE",
        });

        if (ApiUtils.isUnauthorized(response)) {
            return;
        }

        await ApiUtils.ensureOk(response);
    }

    static async pickupMentee(token: string | null, menteeRecordId: number): Promise<AdminMentee | undefined> {
        return ApiUtils.adminJson<AdminMentee>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/pickup`, token, {
            method: "POST"
        });
    }

    static async terminateMentee(token: string | null, menteeRecordId: number, reason: string): Promise<AdminMentee | undefined> {
        return ApiUtils.adminJson<AdminMentee>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/terminate`, token, {
            method: "POST",
            body: JSON.stringify({reason})
        });
    }

    static async passMentee(token: string | null, menteeRecordId: number): Promise<AdminMentee | undefined> {
        return ApiUtils.adminJson<AdminMentee>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/pass`, token, {
            method: "POST"
        });
    }

    static async scheduleMenteeSession(
        token: string | null,
        menteeRecordId: number,
        payload: { mentorId?: number; airport: string; pilots: number; time: string }
    ): Promise<Session | undefined> {
        return ApiUtils.adminJson<Session>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/sessions`, token, {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    static async updateMenteeSession(
        token: string | null,
        menteeRecordId: number,
        sessionId: number,
        payload: { airport: string; pilots: number; time: string }
    ): Promise<Session | undefined> {
        return ApiUtils.adminJson<Session>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/sessions/${sessionId}`, token, {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    }

    static async cancelMenteeSession(token: string | null, menteeRecordId: number, sessionId: number): Promise<Session | undefined> {
        return ApiUtils.adminJson<Session>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/sessions/${sessionId}/cancel`, token, {
            method: "POST"
        });
    }

    static async addMenteeSessionAttendee(token: string | null, menteeRecordId: number, sessionId: number, attendeeId: string): Promise<Session | undefined> {
        return ApiUtils.adminJson<Session>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/sessions/${sessionId}/attendees`, token, {
            method: "POST",
            body: JSON.stringify({attendeeId})
        });
    }

    static async removeMenteeSessionAttendee(token: string | null, menteeRecordId: number, sessionId: number, attendeeId: string): Promise<Session | undefined> {
        return ApiUtils.adminJson<Session>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/sessions/${sessionId}/attendees/${attendeeId}`, token, {
            method: "DELETE"
        });
    }

    static async sendMenteeSessionAssignment(
        token: string | null,
        menteeRecordId: number,
        sessionId: number,
        assignmentId: number | undefined,
        content: string,
        slotAssignmentsJson: string | null
    ): Promise<SessionAssignment | undefined> {
        return ApiUtils.adminJson<SessionAssignment>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/sessions/${sessionId}/assignment-thread`, token, {
            method: "POST",
            body: JSON.stringify({assignmentId, content, slotAssignmentsJson})
        });
    }

    static async getSessionAssignment(
        token: string | null,
        menteeRecordId: number,
        sessionId: number
    ): Promise<SessionAssignment | undefined> {
        return ApiUtils.adminJson<SessionAssignment>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/sessions/${sessionId}/assignment-thread`, token, {
            method: "GET"
        });
    }

    static async updateSessionAssignment(
        token: string | null,
        menteeRecordId: number,
        sessionId: number,
        assignmentId: number | undefined,
        content: string,
        slotAssignmentsJson: string | null
    ): Promise<SessionAssignment | undefined> {
        return ApiUtils.adminJson<SessionAssignment>(`${dashboardApiUrl}/admin/mentees/${menteeRecordId}/sessions/${sessionId}/assignment-thread`, token, {
            method: "PUT",
            body: JSON.stringify({assignmentId, content, slotAssignmentsJson})
        });
    }

    private static async adminJson<T>(url: string, token: string | null, options: RequestInit): Promise<T | undefined> {
        const response = await ApiUtils.fetchWithAuth(url, token, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
        });

        if (ApiUtils.isUnauthorized(response)) {
            return undefined;
        }

        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<T>(response);
    }

    private static async centralAdminJson<T>(url: string, csrfToken: string, options: RequestInit): Promise<T> {
        const response = await ApiUtils.fetchWithAuth(url, csrfToken, {
            ...options,
            headers: {"Content-Type": "application/json", ...options.headers},
        });
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson<T>(response) as T;
    }

    private static async fetchWithAuth(url: string, csrfToken: string | null, options: RequestInit = {}) {
        return await fetch(url, {
            ...options,
            credentials: "include",
            headers: {
                ...options.headers,
                ...((options.method && options.method !== "GET" && csrfToken) ? {"X-CSRF-Token": csrfToken} : {}),
            },
        });
    };

    private static isUnauthorized(response: Response) {
        return response.status === 401 || response.status === 403;
    }

    private static async ensureOk(response: Response) {
        if (response.ok) {
            return;
        }

        const details = await ApiUtils.readErrorDetails(response);
        throw new Error(`${response.url} failed with ${response.status} ${response.statusText}${details}`);
    }

    private static async parseJson<T>(response: Response): Promise<T | undefined> {
        try {
            return await response.json() as T;
        } catch (err) {
            throw new Error(`Failed to parse JSON from ${response.url}: ${ApiUtils.getErrorMessage(err)}`);
        }
    }

    private static async readErrorDetails(response: Response) {
        try {
            const text = await response.text();
            return text ? `: ${text}` : "";
        } catch {
            return "";
        }
    }

    private static getErrorMessage(err: unknown) {
        return err instanceof Error ? err.message : String(err);
    }

}
