import type {
    ExamImportCommitResult, ExamImportPreview, ExamAttemptDetail, ExamAttemptPage, ExamManagementActor,
    ExamQuizUnlock, ExamQuizUnlockUpdate, ExamQuizUnlockUpdateResult, ExamQuizSaveResult, ExamQuizSummary,
    ExamCategory, ExamWebsiteContent, ManagedExamQuiz, NormalizedExamImport,
} from "../types/Exam.ts";
import {ApiUtils} from "./ApiUtils.ts";

export const EXAMS_LOGIN_URL = "/?loginFor=exams&returnTo=%2Fexams";

interface ExamsBrowserSession {accountId: string; discordId: string; expiresAt: string; csrfToken: string; impersonating: boolean}
interface ExamsSessionResponse {session: ExamsBrowserSession | null}

export class ExamsAuthenticationRequiredError extends Error {
    constructor() { super("Sign in to the Exams Center to use this workspace."); this.name = "ExamsAuthenticationRequiredError"; }
}
export const isExamsAuthenticationRequired = (reason: unknown): reason is ExamsAuthenticationRequiredError => reason instanceof ExamsAuthenticationRequiredError;
/** The Dashboard session exists, but the one-use handoff could not establish a local Exams session. */
export class ExamsSessionHandoffError extends Error {
    constructor() { super("Your Dashboard session could not be connected to the Exams Center. Please try again."); this.name = "ExamsSessionHandoffError"; }
}
export const isExamsSessionHandoffFailure = (reason: unknown): reason is ExamsSessionHandoffError => reason instanceof ExamsSessionHandoffError;
export const EXAMS_AUTH_REQUIRED_EVENT = "atcmh:exams-auth-required";
const authRequired = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EXAMS_AUTH_REQUIRED_EVENT));
    return new ExamsAuthenticationRequiredError();
};

export class ExamsApiUtils {
    private static sessionPromise: Promise<ExamsBrowserSession> | null = null;
    private static dashboardHandoffPromise: Promise<boolean> | null = null;

    static clearSessionCache() {
        ExamsApiUtils.sessionPromise = null;
        ExamsApiUtils.dashboardHandoffPromise = null;
    }
    /** Checks only the existing Exams cookie; it never starts a Dashboard handoff or emits an auth event. */
    static async getExistingSession(): Promise<ExamsBrowserSession | null> {
        const response = await fetch("/exams/api/auth/session", {credentials: "include", cache: "no-store"});
        if (response.status === 401) return null;
        if (!response.ok) await ExamsApiUtils.throwResponseError(response);
        const result = await response.json() as ExamsSessionResponse;
        return result.session?.csrfToken ? result.session : null;
    }
    static async bootstrapSession(dashboardCsrf?: string): Promise<ExamsBrowserSession> {
        if (!ExamsApiUtils.sessionPromise) ExamsApiUtils.sessionPromise = ExamsApiUtils.loadSession(dashboardCsrf);
        try { return await ExamsApiUtils.sessionPromise; }
        catch (reason) { ExamsApiUtils.sessionPromise = null; throw reason; }
    }
    private static async loadSession(dashboardCsrf?: string, allowDashboardHandoff = true, handoffCompleted = false): Promise<ExamsBrowserSession> {
        const response = await fetch("/exams/api/auth/session", {credentials: "include", cache: "no-store"});
        if (response.status === 401) {
            if (allowDashboardHandoff && await ExamsApiUtils.establishDashboardHandoff(dashboardCsrf)) return ExamsApiUtils.loadSession(undefined, false, true);
            if (handoffCompleted) throw new ExamsSessionHandoffError();
            throw authRequired();
        }
        if (!response.ok) await ExamsApiUtils.throwResponseError(response);
        const result = await response.json() as ExamsSessionResponse;
        if (!result.session?.csrfToken) {
            if (allowDashboardHandoff && await ExamsApiUtils.establishDashboardHandoff(dashboardCsrf)) return ExamsApiUtils.loadSession(undefined, false, true);
            if (handoffCompleted) throw new ExamsSessionHandoffError();
            throw authRequired();
        }
        return result.session;
    }

    private static establishDashboardHandoff(dashboardCsrf?: string): Promise<boolean> {
        if (!dashboardCsrf) return Promise.resolve(false);
        if (ExamsApiUtils.dashboardHandoffPromise) return ExamsApiUtils.dashboardHandoffPromise;

        const handoff = ExamsApiUtils.performDashboardHandoff(dashboardCsrf);
        ExamsApiUtils.dashboardHandoffPromise = handoff;
        void handoff.then(
            () => { if (ExamsApiUtils.dashboardHandoffPromise === handoff) ExamsApiUtils.dashboardHandoffPromise = null; },
            () => { if (ExamsApiUtils.dashboardHandoffPromise === handoff) ExamsApiUtils.dashboardHandoffPromise = null; },
        );
        return handoff;
    }

    private static async performDashboardHandoff(dashboardCsrf: string): Promise<boolean> {
        const handoffResponse = await fetch(`${ApiUtils.apiOrigin}/auth/handoffs/exams`, {
            method: "POST",
            credentials: "include",
            headers: {"X-CSRF-Token": dashboardCsrf},
        });
        if (!handoffResponse.ok) {
            if (handoffResponse.status === 401 || handoffResponse.status === 403) return false;
            throw new ExamsSessionHandoffError();
        }
        const handoff = (await handoffResponse.json() as {handoff?: unknown}).handoff;
        if (typeof handoff !== "string" || !/^[A-Za-z0-9_-]{20,256}$/.test(handoff)) throw new ExamsSessionHandoffError();
        const callback = new URL("/exams/api/auth/callback", "https://relative.invalid");
        callback.searchParams.set("handoff", handoff);
        callback.searchParams.set("returnTo", "/dashboard/exams");
        // The callback redirects both successful exchanges and invalid handoffs. Do not follow
        // the failure redirect to a 200 Exams page and mistake it for a created session.
        const callbackResponse = await fetch(`${callback.pathname}${callback.search}`, {
            credentials: "include", cache: "no-store", redirect: "manual",
        });
        if (callbackResponse.ok) return true;
        const location = callbackResponse.headers.get("location");
        if (callbackResponse.status >= 300 && callbackResponse.status < 400 && location) {
            const destination = new URL(location, "https://relative.invalid");
            if (destination.pathname === "/dashboard/exams" && !destination.searchParams.has("authError")) return true;
        }
        throw new ExamsSessionHandoffError();
    }

    private static async request(path: string, dashboardCsrf: string, options: RequestInit = {}, allowRebootstrap = true): Promise<Response> {
        const method = (options.method ?? "GET").toUpperCase();
        const mutation = method !== "GET" && method !== "HEAD";
        const session = mutation ? await ExamsApiUtils.bootstrapSession(dashboardCsrf) : null;
        const response = await fetch(path, {
            ...options,
            credentials: "include",
            headers: {...options.headers, ...(mutation ? {"X-CSRF-Token": session!.csrfToken} : {})},
        });
        if (response.status !== 401) return response;
        // Preserve an in-flight handoff so parallel Exam Center reads cannot mint multiple sessions.
        ExamsApiUtils.sessionPromise = null;
        if (allowRebootstrap) {
            try { await ExamsApiUtils.bootstrapSession(dashboardCsrf); }
            catch (reason) {
                if (isExamsSessionHandoffFailure(reason)) throw reason;
                throw authRequired();
            }
            return ExamsApiUtils.request(path, dashboardCsrf, options, false);
        }
        throw authRequired();
    }

    static async getManagementMe(token: string): Promise<ExamManagementActor> { return ExamsApiUtils.getJson("/exams/api/management/me", token); }
    static async listQuizzes(token: string): Promise<ExamQuizSummary[]> { return (await ExamsApiUtils.getJson<{quizzes: ExamQuizSummary[]}>("/exams/api/management/quizzes", token)).quizzes; }
    static async listCategories(token: string): Promise<ExamCategory[]> { return (await ExamsApiUtils.getJson<{categories: ExamCategory[]}>("/exams/api/management/categories", token)).categories; }
    static async createCategory(name: string, _token: string): Promise<ExamCategory> { return (await ExamsApiUtils.fetchJson<{category: ExamCategory}>("/exams/api/management/categories", _token, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name})})).category; }
    static async moveQuizCategory(quizId: string, categoryId: string, _token: string): Promise<ExamQuizSummary> { return (await ExamsApiUtils.fetchJson<{quiz: ExamQuizSummary}>(`/exams/api/management/quizzes/${encodeURIComponent(quizId)}/category`, _token, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({categoryId})})).quiz; }
    static async listAttempts(page: number, pageSize: number, query: string, _token: string): Promise<ExamAttemptPage> { const params=new URLSearchParams({page:String(page),pageSize:String(pageSize)});if(query.trim())params.set("query",query.trim());return ExamsApiUtils.getJson(`/exams/api/management/attempts?${params}`, _token); }
    static async getAttempt(id: string, _token: string): Promise<ExamAttemptDetail> { return (await ExamsApiUtils.getJson<{attempt: ExamAttemptDetail}>(`/exams/api/management/attempts/${encodeURIComponent(id)}`, _token)).attempt; }
    static async deleteAttempt(id: string, token: string): Promise<void> { const response=await ExamsApiUtils.request(`/exams/api/management/attempts/${encodeURIComponent(id)}`,token,{method:"DELETE"});if(!response.ok)await ExamsApiUtils.throwResponseError(response); }
    static async getQuiz(id: string, _token: string): Promise<ManagedExamQuiz> { return (await ExamsApiUtils.getJson<{quiz: ManagedExamQuiz}>(`/exams/api/management/quizzes/${id}`, _token)).quiz; }
    static async listQuizUnlocks(quizId: string, _token: string): Promise<ExamQuizUnlock[]> { return (await ExamsApiUtils.getJson<{unlocks: ExamQuizUnlock[]}>(`/exams/api/management/quizzes/${encodeURIComponent(quizId)}/unlocks`, _token)).unlocks; }
    static async updateQuizUnlock(quizId: string, update: ExamQuizUnlockUpdate, _token: string): Promise<ExamQuizUnlockUpdateResult> { return (await ExamsApiUtils.fetchJson<{unlock: ExamQuizUnlockUpdateResult}>(`/exams/api/management/quizzes/${encodeURIComponent(quizId)}/unlocks`,_token,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(update)})).unlock; }
    static async saveQuiz(quiz: ManagedExamQuiz, token: string): Promise<ExamQuizSaveResult> {const path=quiz.id?`/exams/api/management/quizzes/${quiz.id}`:"/exams/api/management/quizzes";const response=await ExamsApiUtils.request(path,token,{method:quiz.id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(quiz)});if(response.status===422)return response.json();if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json(); }
    static async getWebsiteContent(_token: string): Promise<ExamWebsiteContent> { return (await ExamsApiUtils.getJson<{content: ExamWebsiteContent}>("/exams/api/management/website",_token)).content; }
    static async saveWebsiteContent(content: ExamWebsiteContent, token: string): Promise<ExamWebsiteContent> {const response=await ExamsApiUtils.request("/exams/api/management/website",token,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(content)});if(!response.ok)await ExamsApiUtils.throwResponseError(response);return (await response.json() as {content?:ExamWebsiteContent}).content??content; }
    static async previewImport(file: File, token: string): Promise<ExamImportPreview> {const form=new FormData();form.set("file",file);const response=await ExamsApiUtils.request("/exams/api/management/imports/preview",token,{method:"POST",body:form});if(response.status===422)return response.json();if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json(); }
    static async commitImport(normalizedImport: NormalizedExamImport,idempotencyKey:string,token:string):Promise<ExamImportCommitResult>{const response=await ExamsApiUtils.request("/exams/api/management/imports/commit",token,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({normalizedImport,idempotencyKey})});if(response.status===422)return response.json();if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json();}
    static async getImportTemplate(format:"json"|"csv",token:string):Promise<Blob>{const response=await ExamsApiUtils.request(`/exams/api/management/templates/${format}`,token);if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.blob();}
    private static async getJson<T>(path:string,token:string):Promise<T>{return ExamsApiUtils.fetchJson(path,token);}
    private static async fetchJson<T>(path:string,token:string,options:RequestInit={}):Promise<T>{const response=await ExamsApiUtils.request(path,token,options);if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json();}
    private static async throwResponseError(response:Response):Promise<never>{const details=await response.text().catch(()=>"");throw new Error(`Exams API failed with ${response.status} ${response.statusText}${details?`: ${details}`:""}`);}
}
