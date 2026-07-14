export type DashboardExamView = "catalog" | "create" | "edit" | "import" | "unlocks" | "attempts" | "attempt-review" | "website";

export type DashboardRoute =
    | {screen: "redirect"; destination: string}
    | {screen: "mentees"; params?: {menteeRecordId: string}}
    | {screen: "assignments" | "sessions" | "usernotes" | "stats" | "manual" | "assignment-guide" | "audit-logs" | "accounts" | "alt-accounts"}
    | {screen: "exams"; view: DashboardExamView; params?: {examId?: string; attemptId?: string}}
    | {screen: "not-found"};

export function resolveDashboardRoute(pathname: string): DashboardRoute {
    if (pathname === "/dashboard" || pathname === "/dashboard/") return {screen: "redirect", destination: "/dashboard/mentees"};
    const parts = pathname.replace(/^\/dashboard\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] === "mentees") return parts[1] ? {screen: "mentees", params: {menteeRecordId: parts[1]}} : {screen: "mentees"};
    const direct = new Map<string, DashboardRoute["screen"]>([
        ["assignments", "assignments"], ["sessions", "sessions"], ["usernotes", "usernotes"], ["stats", "stats"],
        ["manual", "manual"], ["audit-logs", "audit-logs"], ["accounts", "accounts"], ["alt-accounts", "alt-accounts"],
    ]);
    if (parts[0] === "guide" && parts[1] === "assignments" && parts.length === 2) return {screen: "assignment-guide"};
    const screen = direct.get(parts[0] ?? "");
    if (screen && parts.length === 1) return {screen} as DashboardRoute;
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
