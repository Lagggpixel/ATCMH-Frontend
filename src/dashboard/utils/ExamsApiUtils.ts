import type {
    ExamImportCommitResult, ExamImportPreview, ExamAttemptDetail, ExamAttemptPage, ExamManagementActor,
    ExamQuizUnlock, ExamQuizUnlockUpdate, ExamQuizUnlockUpdateResult, ExamQuizSaveResult, ExamQuizSummary,
    ExamCategory, ExamWebsiteContent, ManagedExamQuiz, NormalizedExamImport,
} from "../types/Exam.ts";

export const EXAMS_LOGIN_URL = "/exams";

interface ExamsBrowserSession {accountId: string; discordId: string; expiresAt: string; csrfToken: string; impersonating: boolean}
interface ExamsSessionResponse {session: ExamsBrowserSession | null}

export class ExamsAuthenticationRequiredError extends Error {
    constructor() { super("Sign in to the Exams Center to use this workspace."); this.name = "ExamsAuthenticationRequiredError"; }
}
export const isExamsAuthenticationRequired = (reason: unknown): reason is ExamsAuthenticationRequiredError => reason instanceof ExamsAuthenticationRequiredError;
export const EXAMS_AUTH_REQUIRED_EVENT = "atcmh:exams-auth-required";
const authRequired = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EXAMS_AUTH_REQUIRED_EVENT));
    return new ExamsAuthenticationRequiredError();
};

export class ExamsApiUtils {
    private static sessionPromise: Promise<ExamsBrowserSession> | null = null;

    static clearSessionCache() { ExamsApiUtils.sessionPromise = null; }
    static async bootstrapSession(): Promise<ExamsBrowserSession> {
        if (!ExamsApiUtils.sessionPromise) ExamsApiUtils.sessionPromise = ExamsApiUtils.loadSession();
        try { return await ExamsApiUtils.sessionPromise; }
        catch (reason) { ExamsApiUtils.sessionPromise = null; throw reason; }
    }
    private static async loadSession(): Promise<ExamsBrowserSession> {
        const response = await fetch("/exams/api/auth/session", {credentials: "include", cache: "no-store"});
        if (response.status === 401) throw authRequired();
        if (!response.ok) await ExamsApiUtils.throwResponseError(response);
        const result = await response.json() as ExamsSessionResponse;
        if (!result.session?.csrfToken) throw authRequired();
        return result.session;
    }

    private static async request(path: string, options: RequestInit = {}, allowRebootstrap = true): Promise<Response> {
        const method = (options.method ?? "GET").toUpperCase();
        const mutation = method !== "GET" && method !== "HEAD";
        const session = mutation ? await ExamsApiUtils.bootstrapSession() : null;
        const response = await fetch(path, {
            ...options,
            credentials: "include",
            headers: {...options.headers, ...(mutation ? {"X-CSRF-Token": session!.csrfToken} : {})},
        });
        if (response.status !== 401) return response;
        ExamsApiUtils.clearSessionCache();
        if (allowRebootstrap) {
            try { await ExamsApiUtils.bootstrapSession(); }
            catch { throw authRequired(); }
            return ExamsApiUtils.request(path, options, false);
        }
        throw authRequired();
    }

    static async getManagementMe(_token: string): Promise<ExamManagementActor> { return ExamsApiUtils.getJson("/exams/api/management/me", _token); }
    static async listQuizzes(_token: string): Promise<ExamQuizSummary[]> { return (await ExamsApiUtils.getJson<{quizzes: ExamQuizSummary[]}>("/exams/api/management/quizzes", _token)).quizzes; }
    static async listCategories(_token: string): Promise<ExamCategory[]> { return (await ExamsApiUtils.getJson<{categories: ExamCategory[]}>("/exams/api/management/categories", _token)).categories; }
    static async createCategory(name: string, _token: string): Promise<ExamCategory> { return (await ExamsApiUtils.fetchJson<{category: ExamCategory}>("/exams/api/management/categories", _token, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name})})).category; }
    static async moveQuizCategory(quizId: string, categoryId: string, _token: string): Promise<ExamQuizSummary> { return (await ExamsApiUtils.fetchJson<{quiz: ExamQuizSummary}>(`/exams/api/management/quizzes/${encodeURIComponent(quizId)}/category`, _token, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({categoryId})})).quiz; }
    static async listAttempts(page: number, pageSize: number, query: string, _token: string): Promise<ExamAttemptPage> { const params=new URLSearchParams({page:String(page),pageSize:String(pageSize)});if(query.trim())params.set("query",query.trim());return ExamsApiUtils.getJson(`/exams/api/management/attempts?${params}`, _token); }
    static async getAttempt(id: string, _token: string): Promise<ExamAttemptDetail> { return (await ExamsApiUtils.getJson<{attempt: ExamAttemptDetail}>(`/exams/api/management/attempts/${encodeURIComponent(id)}`, _token)).attempt; }
    static async deleteAttempt(id: string, _token: string): Promise<void> { void _token; const response=await ExamsApiUtils.request(`/exams/api/management/attempts/${encodeURIComponent(id)}`,{method:"DELETE"});if(!response.ok)await ExamsApiUtils.throwResponseError(response); }
    static async getQuiz(id: string, _token: string): Promise<ManagedExamQuiz> { return (await ExamsApiUtils.getJson<{quiz: ManagedExamQuiz}>(`/exams/api/management/quizzes/${id}`, _token)).quiz; }
    static async listQuizUnlocks(quizId: string, _token: string): Promise<ExamQuizUnlock[]> { return (await ExamsApiUtils.getJson<{unlocks: ExamQuizUnlock[]}>(`/exams/api/management/quizzes/${encodeURIComponent(quizId)}/unlocks`, _token)).unlocks; }
    static async updateQuizUnlock(quizId: string, update: ExamQuizUnlockUpdate, _token: string): Promise<ExamQuizUnlockUpdateResult> { return (await ExamsApiUtils.fetchJson<{unlock: ExamQuizUnlockUpdateResult}>(`/exams/api/management/quizzes/${encodeURIComponent(quizId)}/unlocks`,_token,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(update)})).unlock; }
    static async saveQuiz(quiz: ManagedExamQuiz, _token: string): Promise<ExamQuizSaveResult> { void _token;const path=quiz.id?`/exams/api/management/quizzes/${quiz.id}`:"/exams/api/management/quizzes";const response=await ExamsApiUtils.request(path,{method:quiz.id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(quiz)});if(response.status===422)return response.json();if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json(); }
    static async getWebsiteContent(_token: string): Promise<ExamWebsiteContent> { return (await ExamsApiUtils.getJson<{content: ExamWebsiteContent}>("/exams/api/management/website",_token)).content; }
    static async saveWebsiteContent(content: ExamWebsiteContent, _token: string): Promise<ExamWebsiteContent> { void _token;const response=await ExamsApiUtils.request("/exams/api/management/website",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(content)});if(!response.ok)await ExamsApiUtils.throwResponseError(response);return (await response.json() as {content?:ExamWebsiteContent}).content??content; }
    static async previewImport(file: File, _token: string): Promise<ExamImportPreview> { void _token;const form=new FormData();form.set("file",file);const response=await ExamsApiUtils.request("/exams/api/management/imports/preview",{method:"POST",body:form});if(response.status===422)return response.json();if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json(); }
    static async commitImport(normalizedImport: NormalizedExamImport,idempotencyKey:string,_token:string):Promise<ExamImportCommitResult>{void _token;const response=await ExamsApiUtils.request("/exams/api/management/imports/commit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({normalizedImport,idempotencyKey})});if(response.status===422)return response.json();if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json();}
    static async getImportTemplate(format:"json"|"csv",_token:string):Promise<Blob>{void _token;const response=await ExamsApiUtils.request(`/exams/api/management/templates/${format}`);if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.blob();}
    private static async getJson<T>(path:string,_token:string):Promise<T>{return ExamsApiUtils.fetchJson(path,_token);}
    private static async fetchJson<T>(path:string,_token:string,options:RequestInit={}):Promise<T>{void _token;const response=await ExamsApiUtils.request(path,options);if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json();}
    private static async throwResponseError(response:Response):Promise<never>{const details=await response.text().catch(()=>"");throw new Error(`Exams API failed with ${response.status} ${response.statusText}${details?`: ${details}`:""}`);}
}
