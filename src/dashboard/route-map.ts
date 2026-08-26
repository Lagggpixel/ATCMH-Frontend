export type DashboardExamView = "catalog" | "create" | "edit" | "import" | "unlocks" | "attempts" | "attempt-review" | "website";
export type DashboardCourseView = "courses" | "course-create" | "course-edit" | "course-preview" | "course-stats";

export type DashboardRoute =
    | {screen: "redirect"; destination: string}
    | {screen: "mentees"; params?: {menteeRecordId: string}}
    | {screen: "assignments" | "sessions" | "usernotes" | "stats" | "manual" | "mock-questions" | "application-questions" | "assignment-guide" | "audit-logs" | "accounts" | "alt-accounts"}
    | {screen: "exams"; view: DashboardExamView; params?: {examId?: string; attemptId?: string}}
    | {screen: "courses"; view: DashboardCourseView; params?: {courseId?: string}}
    | {screen: "not-found"};

function courseDestination(parts: string[]) {
    const encodedParts = parts.map(encodeURIComponent);
    if (parts.length === 0) return "/dashboard/courses";
    if (parts.length === 1 && parts[0] === "new") return "/dashboard/courses/new";
    if (parts.length === 2 && (parts[1] === "edit" || parts[1] === "preview" || parts[1] === "stats")) {
        return `/dashboard/courses/${encodedParts[0]}/${encodedParts[1]}`;
    }
    return null;
}

function resolveCourseRoute(parts: string[]): DashboardRoute | null {
    if (parts.length === 1) return {screen: "courses", view: "courses"};
    if (parts[1] === "new" && parts.length === 2) return {screen: "courses", view: "course-create"};
    if (parts[1] && parts[2] === "edit" && parts.length === 3) return {screen: "courses", view: "course-edit", params: {courseId: parts[1]}};
    if (parts[1] && parts[2] === "preview" && parts.length === 3) return {screen: "courses", view: "course-preview", params: {courseId: parts[1]}};
    if (parts[1] && parts[2] === "stats" && parts.length === 3) return {screen: "courses", view: "course-stats", params: {courseId: parts[1]}};
    return null;
}

export function resolveDashboardRoute(pathname: string): DashboardRoute {
    if (pathname === "/dashboard" || pathname === "/dashboard/") return {screen: "redirect", destination: "/dashboard/mentees"};
    const parts = pathname.replace(/^\/dashboard\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] === "mentees") return parts[1] ? {screen: "mentees", params: {menteeRecordId: parts[1]}} : {screen: "mentees"};
    const direct = new Map<string, DashboardRoute["screen"]>([
        ["assignments", "assignments"], ["sessions", "sessions"], ["usernotes", "usernotes"], ["stats", "stats"],
        ["manual", "manual"], ["audit-logs", "audit-logs"], ["accounts", "accounts"], ["alt-accounts", "alt-accounts"],
        ["mock-questions", "mock-questions"],
        ["application-questions", "application-questions"],
    ]);
    if (parts[0] === "guide" && parts[1] === "assignments" && parts.length === 2) return {screen: "assignment-guide"};
    const screen = direct.get(parts[0] ?? "");
    if (screen && parts.length === 1) return {screen} as DashboardRoute;
    if (parts[0] === "courses") return resolveCourseRoute(parts) ?? {screen: "not-found"};
    if (parts[0] === "exams" && parts[1] === "courses") {
        const destination = courseDestination(parts.slice(2));
        return destination ? {screen: "redirect", destination} : {screen: "not-found"};
    }
    if (parts[0] !== "exams") return {screen: "not-found"};
    if (parts.length === 1) return {screen: "exams", view: "catalog"};
    if (parts[1] === "new" && parts.length === 2) return {screen: "exams", view: "create"};
    if (parts[1] === "import" && parts.length === 2) return {screen: "exams", view: "import"};
    if (parts[1] === "unlocks" && parts.length === 2) return {screen: "exams", view: "unlocks"};
    if (parts[1] === "website" && parts.length === 2) return {screen: "exams", view: "website"};
    if (parts[1] === "attempts" && parts.length === 2) return {screen: "exams", view: "attempts"};
    if (parts[1] === "attempts" && parts[2] && parts.length === 3) return {screen: "exams", view: "attempt-review", params: {attemptId: parts[2]}};
    if (parts[1] && parts[2] === "edit" && parts.length === 3) return {screen: "exams", view: "edit", params: {examId: parts[1]}};
    return {screen: "not-found"};
}
