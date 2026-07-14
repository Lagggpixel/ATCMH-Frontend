export const TERMS_OF_SERVICE_URL = "https://www.atcmh.org/terms";
export const PRIVACY_POLICY_URL = "https://www.atcmh.org/policy";

export const safeDashboardReturnTo = (value: string | null, fallback = "/account") => {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\n") || value.includes("\r")) {
        return fallback;
    }
    return value.startsWith("/auth/") ? fallback : value;
};

export const loginPath = (apiOrigin: string, provider: "discord" | "ifc", returnTo: string) => {
    const url = new URL("/auth/login", apiOrigin);
    url.search = new URLSearchParams({provider, app: "dashboard", returnTo: safeDashboardReturnTo(returnTo)}).toString();
    return url.toString();
};

export const examsImpersonationHandoffUrl = (examsOrigin: string, handoff: string) => {
    const url = new URL("/exams/api/auth/callback", examsOrigin);
    url.search = new URLSearchParams({handoff, returnTo: "/exams"}).toString();
    return url.toString();
};
