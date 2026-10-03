export const DASHBOARD_APPEARANCE_KEY = "atcmh.dashboard.appearance.v1";
export type DashboardAppearance = "light" | "dark" | "system";
export type DashboardTheme = "light" | "dark";

export function parseDashboardAppearance(value: string | null): DashboardAppearance {
    return value === "light" || value === "dark" ? value : "system";
}

export function resolveDashboardTheme(preference: DashboardAppearance, systemDark: boolean): DashboardTheme {
    return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

// Runs before dashboard/course paint. Storage may be unavailable in private/restricted browsers.
export const dashboardAppearanceBootstrap = `(()=>{if(!/^(?:\\/dashboard|\\/exams\\/courses|\\/pilot-guide)(?:\\/|$)/.test(location.pathname))return;let p="system";try{const v=localStorage.getItem("${DASHBOARD_APPEARANCE_KEY}");if(v==="light"||v==="dark")p=v;}catch{}document.documentElement.dataset.dashboardTheme=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;})();`;
