import type {MockQuestionTemplate, MockQuestionTemplatePayload} from "../types/MockQuestionTemplate.ts";
import type {MockQuestionWorkflow, MockQuestionDraft, MockQuestionSlot} from "../types/MockQuestionTemplate.ts";
import type {AtcmhUser} from "../types/AtcmhUser.ts";
import type {Session} from "../types/Session.ts";
import type {UserNote} from "../types/UserNote.ts";
import type {AdminMentee} from "../types/AdminMentee.ts";
import type {AutoMatchCandidate, AutoMatchLeniency, WaitlistHelperPreferences} from "../types/AutoMatchCandidate.ts";
import type {AdminUser} from "../types/AdminUser.ts";
import type {BotHealth} from "../types/BotHealth.ts";
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
    AltEvidenceScan,
    AltSuppression,
    DashboardAuthSession,
} from "../types/Account.ts";
import type {PolicyConsentContext} from "../types/PolicyConsent.ts";
import type {
    ApplicationQuestion,
    ApplicationQuestionUpdate,
    ApplicationType,
    DiscordRestartResult,
    WebsiteApplicationState,
} from "../types/ApplicationQuestion.ts";
import type {
    MentorApplicationContext,
    MentorApplicationDetail,
    MentorApplicationReceipt,
    MentorApplicationSubmission,
    MentorApplicationSummary,
    MentorApplicationPolicy,
    MentorAccountSettings,
} from "../types/MentorApplication.ts";

let dashboardApiUrl = "https://dashboard-api.atcmh.org";
let consentApiUrl = dashboardApiUrl;

export function configureDashboardApiUrl(value: string, directOrigin = value) {
    dashboardApiUrl = value.replace(/\/$/, "");
    consentApiUrl = directOrigin.replace(/\/$/, "");
}

export type AdminUserAuthResult =
    | {status: "authorized"; user: AdminUser}
    | {status: "unauthenticated"}
    | {status: "forbidden"};

export type EligibilityRequirementStatus = "pass" | "fail" | "manual";

export interface EligibilityRequirement {
    id: string;
    label: string;
    status: EligibilityRequirementStatus;
    detail: string;
}

export interface EligibilityResponse {
    status: "ready" | "not_linked" | "unavailable" | "already_ifatc";
    requirements: EligibilityRequirement[];
}

export class ApiUtils {

    static async getHealth(signal: AbortSignal): Promise<BotHealth> {
        const response = await fetch(`${dashboardApiUrl}/admin/health`, {
            credentials: "include", cache: "no-store", signal,
        });
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson<BotHealth>(response) as BotHealth;
    }

    static get apiOrigin() { return dashboardApiUrl; }

    /** Consent uses the backend origin because its challenge cookie is host-only there. */
    static get consentApiOrigin() { return consentApiUrl; }

    static async getAuthSession(): Promise<DashboardAuthSession | null> {
        const response = await fetch(`${dashboardApiUrl}/auth/me`, {credentials: "include"});
        if (response.status === 401) return null;
        await ApiUtils.ensureOk(response);
        const session = await ApiUtils.parseJson<DashboardAuthSession & {status?: string}>(response) as DashboardAuthSession & {status?: string};
        return {...session, status: session.status ? session.status.toUpperCase() as DashboardAuthSession["status"] : undefined};
    }

    static async getEligibility(): Promise<EligibilityResponse> {
        const response = await fetch(`${dashboardApiUrl}/account/eligibility`, {credentials: "include", cache: "no-store"});
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson<EligibilityResponse>(response) as EligibilityResponse;
    }

    static async getAvatarUrl(signal: AbortSignal): Promise<string | null> {
        const response = await fetch(`${dashboardApiUrl}/account/avatar`, {
            credentials: "include", cache: "no-store", signal,
        });
        await ApiUtils.ensureOk(response);
        const body = await ApiUtils.parseJson<{avatarUrl?: string | null}>(response);
        return body?.avatarUrl ?? null;
    }

    static async getApplicationQuestions(): Promise<ApplicationQuestion[]> {
        const response = await fetch(`${dashboardApiUrl}/applications/questions`, {
            credentials: "include",
            cache: "no-store",
        });
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson<ApplicationQuestion[]>(response) ?? [];
    }

    static async getMentorApplicationContext(): Promise<MentorApplicationContext> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/mentor-applications/context`, null);
        await ApiUtils.ensureMentorResponse(response);
        return await ApiUtils.parseJson<MentorApplicationContext>(response) as MentorApplicationContext;
    }

    static async submitMentorApplication(
        csrfToken: string,
        submission: MentorApplicationSubmission,
    ): Promise<MentorApplicationReceipt> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/mentor-applications`, csrfToken, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(submission),
        });
        await ApiUtils.ensureMentorResponse(response);
        return await ApiUtils.parseJson<MentorApplicationReceipt>(response) as MentorApplicationReceipt;
    }

    static async getMentorApplications(token: string): Promise<MentorApplicationSummary[]> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/mentor-applications`, token);
        await ApiUtils.ensureMentorResponse(response);
        return await ApiUtils.parseJson<MentorApplicationSummary[]>(response) ?? [];
    }

    static async getMyMentorApplications(): Promise<MentorApplicationDetail[]> {
        return ApiUtils.mentorRequest<MentorApplicationDetail[]>("/mentor-applications/mine", null);
    }

    static async getMentorApplicationPolicy(token: string): Promise<MentorApplicationPolicy> {
        return ApiUtils.mentorRequest<MentorApplicationPolicy>("/admin/mentor-applications/policy", token);
    }
    static async getMentorAccountSettings(token: string, accountId: string): Promise<MentorAccountSettings> {
        return ApiUtils.mentorRequest(`/admin/accounts/${encodeURIComponent(accountId)}/mentor-application`, token);
    }
    static async updateMentorAccountSettings(token: string, accountId: string, settings: MentorAccountSettings,
        waitMonths: number | null, reapplyAt: string | null): Promise<MentorAccountSettings> {
        return ApiUtils.mentorRequest(`/admin/accounts/${encodeURIComponent(accountId)}/mentor-application`, token, "PUT", {
            waitMonths, reapplyAt, policyRevision:settings.policy.revision,
            applicationId:settings.latestApplication?.id ?? null, revision:settings.latestApplication?.revision ?? null,
        });
    }

    static async decideMentorApplication(token: string, id: number, status: "APPROVED" | "DENIED", reason: string, revision: number): Promise<MentorApplicationDetail> {
        return ApiUtils.mentorRequest<MentorApplicationDetail>(`/admin/mentor-applications/${id}/decision`, token, "POST", {status, reason, revision});
    }

    static async updateMentorApplicationPolicy(token: string, policy: MentorApplicationPolicy, applyToAllDenied: boolean): Promise<MentorApplicationPolicy> {
        return ApiUtils.mentorRequest<MentorApplicationPolicy>("/admin/mentor-applications/policy", token, "PUT", {...policy, applyToAllDenied});
    }

    static async updateMentorApplicantWait(token: string, id: number, revision: number, waitMonths: number | null, reapplyAt: string | null): Promise<unknown> {
        return ApiUtils.mentorRequest(`/admin/mentor-applications/${id}/reapplication`, token, "PUT", {revision, waitMonths, reapplyAt});
    }

    private static async mentorRequest<T>(path: string, token: string | null, method = "GET", body?: unknown): Promise<T> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}${path}`, token, {
            method, ...(body === undefined ? {} : {headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}),
        });
        await ApiUtils.ensureMentorResponse(response);
        return await ApiUtils.parseJson<T>(response) as T;
    }

    static async getMentorApplication(token: string, id: number): Promise<MentorApplicationDetail> {
        const response = await ApiUtils.fetchWithAuth(
            `${dashboardApiUrl}/admin/mentor-applications/${encodeURIComponent(id)}`, token);
        await ApiUtils.ensureMentorResponse(response);
        return await ApiUtils.parseJson<MentorApplicationDetail>(response) as MentorApplicationDetail;
    }

    static async getCurrentApplication(applicationType: ApplicationType): Promise<WebsiteApplicationState> {
        const query = new URLSearchParams({type: applicationType});
        const response = await fetch(`${dashboardApiUrl}/applications/current?${query}`, {
            credentials: "include",
            cache: "no-store",
        });
        await ApiUtils.ensureOk(response);
        return ApiUtils.applicationState(await ApiUtils.parseJson(response));
    }

    static async saveCurrentApplication(
        csrfToken: string,
        applicationType: ApplicationType,
        answers: Record<string, string>,
    ): Promise<WebsiteApplicationState> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/applications/current`, csrfToken, {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({applicationType, answers}),
        });
        await ApiUtils.ensureOk(response);
        return ApiUtils.applicationState(await ApiUtils.parseJson(response));
    }

    static async submitCurrentApplication(
        csrfToken: string,
        applicationType: ApplicationType,
        answers: Record<string, string>,
    ): Promise<WebsiteApplicationState> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/applications/current/submit`, csrfToken, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({applicationType, answers}),
        });
        await ApiUtils.ensureOk(response);
        return ApiUtils.applicationState(await ApiUtils.parseJson(response));
    }

    static async restartApplicationInDiscord(
        csrfToken: string,
        current: Pick<WebsiteApplicationState, "applicationType" | "applicationId" | "version">,
    ): Promise<DiscordRestartResult> {
        const body: Record<string, string | number> = {applicationType: current.applicationType};
        if (current.applicationId != null) body.expectedApplicationId = current.applicationId;
        if (current.version != null) body.expectedVersion = current.version;
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/applications/current/restart-discord`, csrfToken, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body),
        });
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson<DiscordRestartResult>(response) as DiscordRestartResult;
    }

    static async getManagedApplicationQuestions(csrfToken: string): Promise<ApplicationQuestion[]> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/application-questions`, csrfToken);
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson<ApplicationQuestion[]>(response) ?? [];
    }

    static async updateApplicationQuestion(
        csrfToken: string,
        key: string,
        update: ApplicationQuestionUpdate,
    ): Promise<ApplicationQuestion> {
        return await ApiUtils.centralAdminJson<ApplicationQuestion>(
            `${dashboardApiUrl}/admin/application-questions/${encodeURIComponent(key)}`,
            csrfToken,
            {method: "PUT", body: JSON.stringify(update)},
        );
    }

    static async getConsentContext(): Promise<PolicyConsentContext | null> {
        const response = await fetch(`${consentApiUrl}/auth/consent/context`, {
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

    static async getAltAccounts(csrfToken: string, accountId?: string): Promise<{candidates: AltAccountCandidate[]; suppressions: AltSuppression[]; selectedAccountId: string}> {
        const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/alt-accounts${query}`, csrfToken);
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson(response) as {candidates: AltAccountCandidate[]; suppressions: AltSuppression[]; selectedAccountId: string};
    }

    static async startAltEvidenceRescan(csrfToken: string, accountId: string): Promise<AltEvidenceScan> {
        return await ApiUtils.centralAdminJson<AltEvidenceScan>(`${dashboardApiUrl}/admin/alt-accounts/rescans`, csrfToken, {
            method: "POST", body: JSON.stringify({accountId}),
        }) as AltEvidenceScan;
    }

    static async getAltEvidenceRescan(csrfToken: string, scanId: string): Promise<AltEvidenceScan> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/alt-accounts/rescans/${encodeURIComponent(scanId)}`, csrfToken);
        await ApiUtils.ensureOk(response);
        return await ApiUtils.parseJson(response) as AltEvidenceScan;
    }

    static async suppressAltSignal(csrfToken: string, kind: "detach" | "vpn", body: {accountId?: string; ip?: string; addressRef?: string; reason: string}): Promise<void> {
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

    static async getDashboardUsers(token: string | null): Promise<AtcmhUser[] | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/users`, token);

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

    static async getAutoMatchCandidates(
        token: string | null,
        availability: string,
        leniency: AutoMatchLeniency,
    ): Promise<AutoMatchCandidate[] | undefined> {
        return ApiUtils.adminJson<AutoMatchCandidate[]>(`${dashboardApiUrl}/admin/mentees/auto-match`, token, {
            method: "POST",
            body: JSON.stringify({availability, leniency}),
        });
    }

    static async getWaitlistHelperPreferences(token: string | null): Promise<WaitlistHelperPreferences | undefined> {
        return ApiUtils.adminJson<WaitlistHelperPreferences>(`${dashboardApiUrl}/admin/waitlist-helper/preferences`, token, {
            method: "GET",
        });
    }

    static async saveWaitlistHelperPreferences(
        token: string | null,
        preferences: WaitlistHelperPreferences,
    ): Promise<WaitlistHelperPreferences | undefined> {
        return ApiUtils.adminJson<WaitlistHelperPreferences>(`${dashboardApiUrl}/admin/waitlist-helper/preferences`, token, {
            method: "PUT",
            body: JSON.stringify(preferences),
        });
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

    static async getMockQuestionTemplates(token: string | null): Promise<MockQuestionTemplate[] | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/mock-question-templates`, token);
        if (ApiUtils.isUnauthorized(response)) return undefined;
        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<MockQuestionTemplate[]>(response);
    }

    static async getMockQuestionWorkflow(token: string | null): Promise<MockQuestionWorkflow | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/mock-questions`, token);
        if (ApiUtils.isUnauthorized(response)) return undefined;
        await ApiUtils.ensureOk(response);
        return ApiUtils.parseJson<MockQuestionWorkflow>(response);
    }

    static async saveMockSetup(token: string | null, revision: number, sequence: MockQuestionSlot[]) {
        return ApiUtils.adminJson<MockQuestionWorkflow>(`${dashboardApiUrl}/admin/mock-questions/setup`, token, {
            method: "PUT", body: JSON.stringify({revision, sequence}),
        });
    }

    static async saveMockBank(token: string | null, revision: number, id: number | null, name: string, questions: MockQuestionDraft[]) {
        return ApiUtils.adminJson<MockQuestionWorkflow>(`${dashboardApiUrl}/admin/mock-questions/banks${id == null ? "" : `/${id}`}`, token, {
            method: id == null ? "POST" : "PUT", body: JSON.stringify({revision, name, questions}),
        });
    }

    static async deleteMockBank(token: string | null, revision: number, id: number) {
        return ApiUtils.adminJson<MockQuestionWorkflow>(`${dashboardApiUrl}/admin/mock-questions/banks/${id}`, token, {
            method: "DELETE", body: JSON.stringify({revision}),
        });
    }

    static async createMockQuestionTemplate(token: string | null, payload: MockQuestionTemplatePayload): Promise<MockQuestionTemplate | undefined> {
        return ApiUtils.adminJson<MockQuestionTemplate>(`${dashboardApiUrl}/admin/mock-question-templates`, token, {
            method: "POST", body: JSON.stringify(payload),
        });
    }

    static async updateMockQuestionTemplate(token: string | null, id: number, payload: MockQuestionTemplatePayload): Promise<MockQuestionTemplate | undefined> {
        return ApiUtils.adminJson<MockQuestionTemplate>(`${dashboardApiUrl}/admin/mock-question-templates/${id}`, token, {
            method: "PUT", body: JSON.stringify(payload),
        });
    }

    static async deleteMockQuestionTemplate(token: string | null, id: number): Promise<boolean> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/mock-question-templates/${id}`, token, {method: "DELETE"});
        if (ApiUtils.isUnauthorized(response)) return false;
        await ApiUtils.ensureOk(response);
        return true;
    }

    static async getMockQuestionAttachment(token: string | null, templateId: number, attachmentId: number): Promise<Blob | undefined> {
        const response = await ApiUtils.fetchWithAuth(`${dashboardApiUrl}/admin/mock-question-templates/${templateId}/attachments/${attachmentId}`, token);
        if (ApiUtils.isUnauthorized(response)) return undefined;
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

    static async updateMenteeProfile(token: string | null, id: number, profile: {region: string; timezone: string; availability: string}): Promise<AdminMentee | undefined> {
        return ApiUtils.adminJson<AdminMentee>(`${dashboardApiUrl}/admin/mentees/${id}/profile`, token, {
            method: "PUT", body: JSON.stringify(profile),
        });
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

    private static async ensureMentorResponse(response: Response) {
        if (response.ok) return;
        let message = "The request could not be completed.";
        try {
            const body = await response.json() as {error?: unknown};
            if (typeof body.error === "string" && body.error.trim()) message = body.error;
        } catch { /* Keep the user-facing fallback when the response is not JSON. */ }
        throw new Error(message);
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

    private static applicationState(payload: unknown): WebsiteApplicationState {
        if (!payload || typeof payload !== "object") throw new Error("Application response was empty.");
        const value = "application" in payload && payload.application && typeof payload.application === "object"
            ? payload.application : payload;
        const state = value as WebsiteApplicationState & {answers?: Record<string, unknown>};
        const answers = Object.fromEntries(Object.entries(state.answers ?? {}).flatMap(([key, answer]) => {
            if (typeof answer === "boolean") return [[key, answer ? "yes" : "no"]];
            if (typeof answer === "string" || typeof answer === "number") return [[key, String(answer)]];
            return [];
        }));
        return {...state, answers};
    }

    private static getErrorMessage(err: unknown) {
        return err instanceof Error ? err.message : String(err);
    }

}
