import { cookies } from "next/headers";

import { sessionCookie, loopbackSessionCookie, legacyDashboardSessionCookie, sessionTokenFromCookieStore } from "./central-auth";
import type { CoursePrerequisiteSummary, GroundSchoolStatus, LearnerCourse, LearnerCourseSummary } from "@/src/dashboard/types/Course";

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

export type GroundSchoolGateCode =
    | "DISCORD_REQUIRED"
    | "IFC_REQUIRED"
    | "DISCORD_SERVER_REQUIRED"
    | "ENROLLMENT_REQUIRED";

export interface GroundSchoolGateCourseMeta {
    id: string;
    slug: string;
    title: string;
    description: string;
}

export class GroundSchoolGateError extends Error {
    constructor(
        readonly code: GroundSchoolGateCode,
        message: string,
        readonly course?: GroundSchoolGateCourseMeta,
    ) {
        super(message);
        this.name = "GroundSchoolGateError";
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

const GATE_CODES = new Set<GroundSchoolGateCode>([
    "DISCORD_REQUIRED",
    "IFC_REQUIRED",
    "DISCORD_SERVER_REQUIRED",
    "ENROLLMENT_REQUIRED",
]);

export function groundSchoolGateErrorFromPayload(status: number, payload: unknown): GroundSchoolGateError | null {
    if ((status !== 403 && status !== 409) || typeof payload !== "object" || payload === null) return null;
    const body = payload as Record<string, unknown>;
    if (typeof body.code !== "string" || !GATE_CODES.has(body.code as GroundSchoolGateCode)) return null;
    const message = typeof body.error === "string" && body.error.trim()
        ? body.error
        : "Additional setup is required to participate in the Ground School.";
    let course: GroundSchoolGateCourseMeta | undefined;
    if (typeof body.course === "object" && body.course !== null) {
        const meta = body.course as Record<string, unknown>;
        if (typeof meta.id === "string" && typeof meta.title === "string") {
            course = {
                id: meta.id,
                slug: typeof meta.slug === "string" ? meta.slug : "",
                title: meta.title,
                description: typeof meta.description === "string" ? meta.description : "",
            };
        }
    }
    return new GroundSchoolGateError(body.code as GroundSchoolGateCode, message, course);
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
        throw new Error(`Ground School backend failed with ${response.status}${details ? `: ${details}` : ""}`);
    }
    return response.json() as Promise<T>;
}

const DEFAULT_GROUND_SCHOOL_STATUS: GroundSchoolStatus = {
    authenticated: false,
    hasDiscord: false,
    hasIfc: false,
    ifcName: null,
    inDiscord: false,
    enrolledCourseCount: 0,
    thread: null,
};

export async function listGroundSchoolCatalogue(): Promise<{courses: LearnerCourseSummary[]; groundSchool: GroundSchoolStatus}> {
    const body = await json<{courses: LearnerCourseSummary[]; groundSchool?: GroundSchoolStatus}>(await backendRequest("/courses"));
    return {
        courses: body.courses ?? [],
        groundSchool: body.groundSchool ?? DEFAULT_GROUND_SCHOOL_STATUS,
    };
}

export async function listPublishedCourses(): Promise<LearnerCourseSummary[]> {
    return (await listGroundSchoolCatalogue()).courses;
}

export async function getCourseForLearner(courseId: string): Promise<LearnerCourse | null> {
    if (!isCourseId(courseId)) return null;
    const response = await backendRequest("/courses/" + encodeURIComponent(courseId));
    if (response.status === 404) return null;
    if (response.status === 403 || response.status === 409) {
        const payload = await response.clone().json().catch(() => undefined);
        const locked = courseLockedErrorFromPayload(response.status, payload);
        if (locked) throw locked;
        const gated = groundSchoolGateErrorFromPayload(response.status, payload);
        if (gated) throw gated;
    }
    return (await json<{course: LearnerCourse}>(response)).course;
}

export async function isPublishedCourseQuiz(courseId: string, quizId: string): Promise<boolean> {
    if (!isCourseId(courseId) || !isCourseId(quizId)) return false;
    const response = await backendRequest(`/courses/${encodeURIComponent(courseId)}/quizzes/${encodeURIComponent(quizId)}/access`);
    return response.ok;
}
