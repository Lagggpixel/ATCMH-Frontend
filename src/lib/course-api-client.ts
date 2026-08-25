import { cookies } from "next/headers";

import { examsSessionCookie } from "./central-auth";
import type { LearnerCourse, ManagedCourseSummary } from "@/src/dashboard/types/Course";

const dashboardApiUrl = () => (process.env.DASHBOARD_API_URL ?? "https://dashboard-api.atcmh.org").replace(/\/$/, "");

export function isCourseId(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function frontendOrigin() {
    return process.env.FRONTEND_PUBLIC_ORIGIN ?? "https://www.atcmh.org";
}

async function backendRequest(path: string, options: RequestInit = {}) {
    const cookieStore = await cookies();
    const forwarded = [examsSessionCookie, "atcmh_dashboard_session"].flatMap(name => {
        const value = cookieStore.get(name)?.value;
        return value ? [`${name}=${encodeURIComponent(value)}`] : [];
    });
    const headers = new Headers(options.headers);
    if (forwarded.length > 0) headers.set("Cookie", forwarded.join("; "));
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

export async function listPublishedCourses(): Promise<ManagedCourseSummary[]> {
    const body = await json<{courses: ManagedCourseSummary[]}>(await backendRequest("/courses"));
    return body.courses;
}

export async function getCourseForLearner(courseId: string): Promise<LearnerCourse | null> {
    if (!isCourseId(courseId)) return null;
    const response = await backendRequest(`/courses/${encodeURIComponent(courseId)}`);
    if (response.status === 404) return null;
    return (await json<{course: LearnerCourse}>(response)).course;
}

export async function isPublishedCourseQuiz(courseId: string, quizId: string): Promise<boolean> {
    if (!isCourseId(courseId) || !isCourseId(quizId)) return false;
    const response = await backendRequest(`/courses/${encodeURIComponent(courseId)}/quizzes/${encodeURIComponent(quizId)}/access`);
    return response.ok;
}
