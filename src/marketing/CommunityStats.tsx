"use client";

import {createContext, useContext, useEffect, useState, type ReactNode} from "react";
import {formatCommunityCount, parseCommunityStatistics, type CommunityStatistics} from "./community-statistics";

const CommunityStatsContext = createContext<{counts?: CommunityStatistics; unavailable: boolean}>({unavailable: false});

export function CommunityStatsProvider({children}: {children: ReactNode}) {
    const [counts, setCounts] = useState<CommunityStatistics>();
    const [unavailable, setUnavailable] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        let pending = false;
        async function refresh() {
            if (pending || controller.signal.aborted) return;
            pending = true;
            try {
                const response = await fetch("/api/dashboard/public/community-stats", {
                    cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
                });
                if (!response.ok) throw new Error("Community counts are unavailable");
                const nextCounts = parseCommunityStatistics(await response.json());
                if (!controller.signal.aborted) {
                    setCounts(nextCounts);
                    setUnavailable(false);
                }
            } catch {
                if (!controller.signal.aborted) setUnavailable(true);
            } finally {
                pending = false;
            }
        }
        void refresh();
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") void refresh();
        }, 60_000);
        const onVisible = () => {
            if (document.visibilityState === "visible") void refresh();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            controller.abort();
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    return <CommunityStatsContext.Provider value={{counts, unavailable}}>{children}</CommunityStatsContext.Provider>;
}

export function CommunityCount({kind}: {kind: keyof CommunityStatistics}) {
    const {counts, unavailable} = useContext(CommunityStatsContext);
    const title = unavailable ? counts ? "Last available count; live count temporarily unavailable" : "Live count temporarily unavailable"
        : counts ? "Current Discord server count, rounded down" : "Loading live count";
    return <strong title={title} aria-live="polite">{counts ? formatCommunityCount(counts[kind], kind) : "—"}</strong>;
}
