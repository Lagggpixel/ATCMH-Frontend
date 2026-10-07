import { cookies } from "next/headers";

import { sessionCookie, loopbackSessionCookie, legacyDashboardSessionCookie, sessionTokenFromCookieStore } from "./central-auth";
import type { CoursePrerequisiteSummary, LearnerCourse, LearnerCourseSummary } from "@/src/dashboard/types/Course";

const dashboardApiUrl = () => (process.env.DASHBOARD_API_URL ?? "https://dashboard-api.atcmh.org").replace(/\/$/, "");

export function isCourseId(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class CourseLockedError extends Error {
    constructor(
        readonly prerequisites: CoursePrerequisiteSummary[],
        readonly hasUnavailablePrerequisites: boolean,
    ) {
        super("This course is locked until its prerequisites are complete.");
        this.name = "CourseLockedError";
    }
}

export function courseLockedErrorFromPayload(status: number, payload: unknown): CourseLockedError | null {
    if (status !== 403 || typeof payload !== "object" || payload === null) return null;
    const body = payload as Record<string, unknown>;
    if (body.locked !== true || typeof body.error !== "string" || typeof body.hasUnavailablePrerequisites !== "boolean" || !Array.isArray(body.prerequisites)) return null;
    const prerequisites: CoursePrerequisiteSummary[] = [];
    for (const item of body.prerequisites) {
        if (typeof item !== "object" || item === null) return null;
        const prerequisite = item as Record<string, unknown>;
        if (typeof prerequisite.courseId !== "string" || !isCourseId(prerequisite.courseId)
            || typeof prerequisite.title !== "string" || typeof prerequisite.slug !== "string"
            || typeof prerequisite.completed !== "boolean") return null;
        prerequisites.push({courseId: prerequisite.courseId, title: prerequisite.title, slug: prerequisite.slug, completed: prerequisite.completed});
    }
    return new CourseLockedError(prerequisites, body.hasUnavailablePrerequisites);
}

function frontendOrigin() {
    return process.env.FRONTEND_PUBLIC_ORIGIN ?? "https://www.atcmh.org";
}

async function backendRequest(path: string, options: RequestInit = {}) {
    const cookieStore = await cookies();
    const token = sessionTokenFromCookieStore(cookieStore);
    const name = cookieStore.get(sessionCookie) ? sessionCookie
        : cookieStore.get(loopbackSessionCookie) ? loopbackSessionCookie : legacyDashboardSessionCookie;
    const headers = new Headers(options.headers);
    if (token) headers.set("Cookie", `${name}=${encodeURIComponent(token)}`);
    headers.set("Origin", frontendOrigin());
    return fetch(`${dashboardApiUrl()}${path}`, {
        ...options,
        headers,
        cache: "no-store",
    });
}

async function json<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(`Course backend failed with ${response.status}${details ? `: ${details}` : ""}`);
    }
    return response.json() as Promise<T>;
}

export async function listPublishedCourses(): Promise<LearnerCourseSummary[]> {
    const body = await json<{courses: LearnerCourseSummary[]}>(await backendRequest("/courses"));
    return body.courses;
}

export async function getCourseForLearner(courseId: string): Promise<LearnerCourse | null> {
    if (!isCourseId(courseId)) return null;
    const response = await backendRequest("/courses/" + encodeURIComponent(courseId));
    if (response.status === 404) return null;
    if (response.status === 403) {
        const locked = courseLockedErrorFromPayload(response.status, await response.clone().json().catch(() => undefined));
        if (locked) throw locked;
    }
    return (await json<{course: LearnerCourse}>(response)).course;
}

export async function isPublishedCourseQuiz(courseId: string, quizId: string): Promise<boolean> {
    if (!isCourseId(courseId) || !isCourseId(quizId)) return false;
    const response = await backendRequest(`/courses/${encodeURIComponent(courseId)}/quizzes/${encodeURIComponent(quizId)}/access`);
    return response.ok;
}
