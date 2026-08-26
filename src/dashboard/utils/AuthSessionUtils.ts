export const TERMS_OF_SERVICE_URL = "https://www.atcmh.org/terms";
export const PRIVACY_POLICY_URL = "https://www.atcmh.org/policy";

export const safeDashboardReturnTo = (value: string | null, fallback = "/account") => {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\n") || value.includes("\r")) {
        return fallback;
    }
    return value.startsWith("/auth/") ? fallback : value;
};

export const loginPath = (apiOrigin: string, provider: "discord" | "ifc", returnTo: string) => {
    void apiOrigin;
    return `/api/auth/login?${new URLSearchParams({provider, returnTo: safeDashboardReturnTo(returnTo)})}`;
};
