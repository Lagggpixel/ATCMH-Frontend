"use client";

import {createContext, type ReactNode, useCallback, useContext, useEffect, useState} from "react";
import type {DashboardAuthSession} from "@/src/dashboard/types/Account";
import type {AdminUser} from "@/src/dashboard/types/AdminUser";
import {ApiUtils, configureDashboardApiUrl} from "@/src/dashboard/utils/ApiUtils";

interface PortalAuthValue {
  session: DashboardAuthSession | null;
  avatarUrl: string | null;
  adminUser?: AdminUser;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthValue | null>(null);

export function usePortalAuth() {
  const value = useContext(PortalAuthContext);
  if (!value) throw new Error("PortalAuthProvider is required");
  return value;
}

export default function PortalAuthProvider({dashboardApiUrl, children}: {dashboardApiUrl: string; children: ReactNode}) {
  configureDashboardApiUrl("/api/dashboard", dashboardApiUrl);
  const [session, setSession] = useState<DashboardAuthSession | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<{session: DashboardAuthSession; url: string | null} | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    let nextSession: DashboardAuthSession | null;
    try {
      nextSession = await ApiUtils.getAuthSession();
      setSession(nextSession);
      if (!nextSession) {
        setAdminUser(undefined);
        setLoading(false);
        return;
      }
    } catch (reason) {
      setSession(null);
      setAdminUser(undefined);
      setError(reason instanceof Error ? reason.message : String(reason));
      setLoading(false);
      return;
    }
    try {
      const admin = await ApiUtils.getAdminUser(nextSession.csrfToken);
      setAdminUser(admin.status === "authorized" ? admin.user : undefined);
    } catch (reason) {
      setAdminUser(undefined);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!session) return;
    const delay = new Date(session.expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(() => { setSession(null); setAdminUser(undefined); }, Math.max(0, Math.min(delay, 2_147_483_647)));
    return () => window.clearTimeout(timer);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const updateAvatar = () => {
      void ApiUtils.getAvatarUrl(controller.signal).then(url => {
        if (!controller.signal.aborted) setAvatar({session, url});
      }).catch(() => { /* Profile images are optional; keep the account usable. */ });
    };
    updateAvatar();
    const timer = window.setInterval(updateAvatar, 60 * 60 * 1000);
    return () => {controller.abort(); window.clearInterval(timer);};
  }, [session]);

  const logout = useCallback(async (all = false) => {
    if (!session) return;
    await ApiUtils.logout(session.csrfToken, all);
    setSession(null);
    setAdminUser(undefined);
  }, [session]);

  const avatarUrl = avatar?.session === session ? avatar?.url ?? null : null;
  return <PortalAuthContext.Provider value={{session, avatarUrl, adminUser, loading, error, refresh, logout}}>{children}</PortalAuthContext.Provider>;
}
