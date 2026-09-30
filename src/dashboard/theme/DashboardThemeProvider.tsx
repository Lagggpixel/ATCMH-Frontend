"use client";

import {createContext, useContext, useLayoutEffect, useState, type ReactNode} from "react";
import {DASHBOARD_APPEARANCE_KEY, parseDashboardAppearance, resolveDashboardTheme, type DashboardAppearance} from "./appearance";

interface AppearanceContext {
    appearance: DashboardAppearance;
    setAppearance: (value: DashboardAppearance) => void;
}
const DashboardAppearanceContext = createContext<AppearanceContext | null>(null);

export function useDashboardAppearance() {
    const value = useContext(DashboardAppearanceContext);
    if (!value) throw new Error("DashboardThemeProvider is required");
    return value;
}

export default function DashboardThemeProvider({children}: {children: ReactNode}) {
    const [appearance, setPreference] = useState<DashboardAppearance>("system");

    useLayoutEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        let preference: DashboardAppearance = "system";
        const apply = (next: DashboardAppearance) => {
            preference = next;
            document.documentElement.dataset.dashboardTheme = resolveDashboardTheme(next, media.matches);
            setPreference(next);
        };
        try { preference = parseDashboardAppearance(localStorage.getItem(DASHBOARD_APPEARANCE_KEY)); } catch { /* Use system appearance when storage is blocked. */ }
        apply(preference);
        const onSystemChange = () => apply(preference);
        const onStorage = (event: StorageEvent) => {
            if (event.key === DASHBOARD_APPEARANCE_KEY || event.key === null) apply(parseDashboardAppearance(event.newValue));
        };
        const onPreference = (event: Event) => apply((event as CustomEvent<DashboardAppearance>).detail);
        media.addEventListener("change", onSystemChange);
        window.addEventListener("storage", onStorage);
        window.addEventListener("dashboard-appearance", onPreference);
        return () => {
            media.removeEventListener("change", onSystemChange);
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("dashboard-appearance", onPreference);
            delete document.documentElement.dataset.dashboardTheme;
        };
    }, []);

    const setAppearance = (next: DashboardAppearance) => {
        try { localStorage.setItem(DASHBOARD_APPEARANCE_KEY, next); } catch { /* The switch still works for this visit. */ }
        window.dispatchEvent(new CustomEvent("dashboard-appearance", {detail: next}));
    };

    return <DashboardAppearanceContext.Provider value={{appearance, setAppearance}}>
        <div className="dashboard-theme">{children}</div>
    </DashboardAppearanceContext.Provider>;
}
