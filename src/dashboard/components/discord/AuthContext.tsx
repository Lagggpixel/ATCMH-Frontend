import {useCallback, useEffect, useState} from "react";
import type {DashboardAuthSession} from "../../types/Account.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";

const useAuth = () => {
    const [session, setSession] = useState<DashboardAuthSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setSession(await ApiUtils.getAuthSession());
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            setSession(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (!session) return;
        const delay = new Date(session.expiresAt).getTime() - Date.now();
        if (delay <= 0) { setSession(null); return; }
        const timer = window.setTimeout(() => setSession(null), Math.min(delay, 2_147_483_647));
        return () => window.clearTimeout(timer);
    }, [session]);

    const logout = useCallback(async (all = false) => {
        if (!session) return;
        await ApiUtils.logout(session.csrfToken, all);
        setSession(null);
    }, [session]);

    return {session, loading, error, refresh, logout};
};

export default useAuth;
