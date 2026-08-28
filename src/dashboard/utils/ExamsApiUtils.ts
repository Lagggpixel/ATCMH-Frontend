import type {
    ExamImportCommitResult, ExamImportError, ExamImportPreview, ExamAttemptDetail, ExamAttemptPage, ExamManagementActor,
    ExamQuizUnlock, ExamQuizUnlockUpdate, ExamQuizUnlockUpdateResult, ExamQuizSaveResult, ExamQuizSummary,
    ExamCategory, ExamWebsiteContent, ManagedExamQuiz, NormalizedExamImport,
} from "../types/Exam.ts";
import type {CourseActivitySubmission, CourseMediaUpload, CourseStatistics, CourseViewEventInput, ManagedCourse, ManagedCourseDraft, ManagedCourseSummary} from "../types/Course.ts";
import {ApiUtils} from "./ApiUtils.ts";

export const EXAMS_LOGIN_URL = "/?login=1&returnTo=%2Fexams";

interface ExamsBrowserSession {accountId: string; discordId: string; expiresAt: string; csrfToken: string; impersonating: boolean}
interface ExamsSessionResponse {session: ExamsBrowserSession | null}

export class ExamsAuthenticationRequiredError extends Error {
    constructor() { super("Sign in to ATCMH to use the Exam Center."); this.name = "ExamsAuthenticationRequiredError"; }
}
export const isExamsAuthenticationRequired = (reason: unknown): reason is ExamsAuthenticationRequiredError => reason instanceof ExamsAuthenticationRequiredError;
export const EXAMS_AUTH_REQUIRED_EVENT = "atcmh:exams-auth-required";
const authRequired = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EXAMS_AUTH_REQUIRED_EVENT));
    return new ExamsAuthenticationRequiredError();
};

export class ExamsApiUtils {
    private static sessionPromise: Promise<ExamsBrowserSession> | null = null;

    static clearSessionCache() {
        ExamsApiUtils.sessionPromise = null;
    }
    /** Checks only the existing Exams cookie; it never starts a Dashboard handoff or emits an auth event. */
    static async getExistingSession(): Promise<ExamsBrowserSession | null> {
        const response = await fetch("/exams/api/auth/session", {credentials: "include", cache: "no-store"});
        if (response.status === 401) return null;
        if (!response.ok) await ExamsApiUtils.throwResponseError(response);
        const result = await response.json() as ExamsSessionResponse;
        return result.session?.csrfToken ? result.session : null;
    }
    static async bootstrapSession(_dashboardCsrf?: string): Promise<ExamsBrowserSession> {
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
        // Share the current session read across parallel retries.
        ExamsApiUtils.sessionPromise = null;
        if (allowRebootstrap) {
            try { await ExamsApiUtils.bootstrapSession(dashboardCsrf); }
            catch { throw authRequired(); }
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
    static async saveQuiz(quiz: ManagedExamQuiz, token: string): Promise<ExamQuizSaveResult> {
        const path = quiz.id ? `/exams/api/management/quizzes/${quiz.id}` : "/exams/api/management/quizzes";
        const response = await ExamsApiUtils.request(path, token, {
            method: quiz.id ? "PUT" : "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(quiz),
        });
        if (response.status === 422) {
            const rejected = await response.json() as {error?: string; errors?: ExamImportError[]; issues?: ExamImportError[]};
            return {
                valid: false,
                errors: rejected.errors ?? rejected.issues ?? [{path: "quiz", message: rejected.error ?? "The Exams service rejected this quiz."}],
            };
        }
        if (!response.ok) await ExamsApiUtils.throwResponseError(response);
        return response.json();
    }
    static async listCourses(token: string): Promise<ManagedCourseSummary[]> { return (await ExamsApiUtils.backendJson<{courses: ManagedCourseSummary[]}>('/admin/courses', token)).courses; }
    static async getCourse(id: string, token: string): Promise<ManagedCourse> { return (await ExamsApiUtils.backendJson<{course: ManagedCourse}>(`/admin/courses/${encodeURIComponent(id)}`, token)).course; }
    static async getCourseStatistics(id: string, token: string): Promise<CourseStatistics> { return (await ExamsApiUtils.backendJson<{statistics: CourseStatistics}>(`/admin/courses/${encodeURIComponent(id)}/statistics`, token)).statistics; }
    static async saveCourse(course: ManagedCourseDraft, token: string): Promise<ManagedCourse> { const path = course.id ? `/admin/courses/${encodeURIComponent(course.id)}` : "/admin/courses"; return (await ExamsApiUtils.backendJson<{course: ManagedCourse}>(path, token, {method: course.id ? "PUT" : "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(course)})).course; }
    static async uploadCourseMedia(courseId: string, file: File, token: string, onProgress?: (percentage: number) => void, signal?: AbortSignal): Promise<CourseMediaUpload> {
        const path = `/admin/courses/${encodeURIComponent(courseId)}/media?filename=${encodeURIComponent(file.name)}`;
        if (!onProgress || typeof XMLHttpRequest === "undefined") {
            return (await ExamsApiUtils.backendJson<{media: CourseMediaUpload}>(path, token, {method: "POST", headers: {"Content-Type": file.type}, body: file, signal})).media;
        }
        return new Promise<CourseMediaUpload>((resolve, reject) => {
            const request = new XMLHttpRequest();
            const abort = () => request.abort();
            const cleanup = () => signal?.removeEventListener("abort", abort);
            if (signal?.aborted) { reject(new Error("Course media upload was cancelled.")); return; }
            request.open("POST", `${ApiUtils.apiOrigin}${path}`);
            request.withCredentials = true;
            request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
            request.setRequestHeader("X-CSRF-Token", token);
            request.upload.addEventListener("progress", event => {
                if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
            });
            signal?.addEventListener("abort", abort, {once: true});
            request.addEventListener("error", () => { cleanup(); reject(new Error("Course media upload failed.")); });
            request.addEventListener("abort", () => { cleanup(); reject(new Error("Course media upload was cancelled.")); });
            request.addEventListener("load", () => {
                cleanup();
                let body: {media?: CourseMediaUpload; error?: string} = {};
                try { body = JSON.parse(request.responseText || "{}"); } catch { /* handled by the generic response below */ }
                if (request.status >= 200 && request.status < 300 && body.media) resolve(body.media);
                else reject(new Error(body.error || `Course media upload failed with ${request.status}.`));
            });
            request.send(file);
        });
    }
    static async deleteCourseMedia(courseId: string, mediaId: string, token: string): Promise<void> {
        const response = await ExamsApiUtils.backendRequest(`/admin/courses/${encodeURIComponent(courseId)}/media/${encodeURIComponent(mediaId)}`, token, {method: "DELETE"});
        if (!response.ok) await ExamsApiUtils.throwResponseError(response);
    }
    static async submitCourseActivity(courseId: string, activityId: string, answer: Record<string, unknown>, token: string, idempotencyKey?: string): Promise<CourseActivitySubmission> {
        const headers: Record<string, string> = {"Content-Type": "application/json"};
        if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
        return ExamsApiUtils.backendJson<CourseActivitySubmission>(`/courses/${encodeURIComponent(courseId)}/activities/${encodeURIComponent(activityId)}/submit`, token, {method: "POST", headers, body: JSON.stringify({answer})});
    }
    static async recordCourseView(courseId: string, event: CourseViewEventInput, token: string, keepalive = false): Promise<void> {
        await ExamsApiUtils.backendJson<{accepted: boolean}>(`/courses/${encodeURIComponent(courseId)}/view-events`, token, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(event),
            keepalive,
        });
    }
    static async getWebsiteContent(_token: string): Promise<ExamWebsiteContent> { return (await ExamsApiUtils.getJson<{content: ExamWebsiteContent}>("/exams/api/management/website",_token)).content; }
    static async saveWebsiteContent(content: ExamWebsiteContent, token: string): Promise<ExamWebsiteContent> {const response=await ExamsApiUtils.request("/exams/api/management/website",token,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(content)});if(!response.ok)await ExamsApiUtils.throwResponseError(response);return (await response.json() as {content?:ExamWebsiteContent}).content??content; }
    static async previewImport(file: File, token: string): Promise<ExamImportPreview> {const form=new FormData();form.set("file",file);const response=await ExamsApiUtils.request("/exams/api/management/imports/preview",token,{method:"POST",body:form});if(response.status===422)return response.json();if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json(); }
    static async commitImport(normalizedImport: NormalizedExamImport,idempotencyKey:string,token:string):Promise<ExamImportCommitResult>{const response=await ExamsApiUtils.request("/exams/api/management/imports/commit",token,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({normalizedImport,idempotencyKey})});if(response.status===422)return response.json();if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json();}
    static async getImportTemplate(format:"json"|"csv",token:string):Promise<Blob>{const response=await ExamsApiUtils.request(`/exams/api/management/templates/${format}`,token);if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.blob();}
    private static async getJson<T>(path:string,token:string):Promise<T>{return ExamsApiUtils.fetchJson(path,token);}
    private static async backendRequest(path: string, token: string, options: RequestInit = {}) {
        const method = (options.method ?? "GET").toUpperCase();
        return fetch(`${ApiUtils.apiOrigin}${path}`, {
            ...options,
            credentials: "include",
            headers: {
                ...options.headers,
                ...(method !== "GET" && method !== "HEAD" ? {"X-CSRF-Token": token} : {}),
            },
        });
    }
    private static async backendJson<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
        const response = await ExamsApiUtils.backendRequest(path, token, options);
        if (!response.ok) await ExamsApiUtils.throwResponseError(response);
        return response.json() as Promise<T>;
    }
    private static async fetchJson<T>(path:string,token:string,options:RequestInit={}):Promise<T>{const response=await ExamsApiUtils.request(path,token,options);if(!response.ok)await ExamsApiUtils.throwResponseError(response);return response.json();}
    private static async throwResponseError(response:Response):Promise<never>{const details=await response.text().catch(()=>"");throw new Error(`Exams API failed with ${response.status} ${response.statusText}${details?`: ${details}`:""}`);}
}
