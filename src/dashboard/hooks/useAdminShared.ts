import {useEffect, useState} from "react";
import type {AtcmhUser} from "../types/AtcmhUser";
import {formatUserName} from "../../lib/user-display-name.ts";

// -----------------------------------------------------------------------------
// useUserLookup
// -----------------------------------------------------------------------------

export interface UserLookup {
    usersById: Map<string, AtcmhUser>;
    getUserName: (id: string) => string;
    getUserNameOrFallback: (id?: string | null, fallback?: string | null) => string;
}

export function useUserLookup(users: AtcmhUser[] | undefined): UserLookup {
    const usersById = new Map(users?.map(user => [user.id, user]) ?? []);

    const getUserName = (id: string) => formatUserName(id, usersById.get(id)?.username);

    const getUserNameOrFallback = (id?: string | null, fallback?: string | null) =>
        formatUserName(id, id == null ? undefined : usersById.get(id)?.username, fallback);

    return {usersById, getUserName, getUserNameOrFallback};
}

// -----------------------------------------------------------------------------
// useAuthGuard
// -----------------------------------------------------------------------------

export interface AuthGuardResult {
    showLogin: boolean;
    showLoading: boolean;
    showError: boolean;
    showUnauthorized: boolean;
}

export function useAuthGuard(
    loggedIn: boolean,
    loaded: boolean,
    error: string | undefined,
    authorized: boolean
): AuthGuardResult {
    return {
        showLogin: !loggedIn,
        showLoading: loggedIn && !loaded,
        showError: loggedIn && loaded && !!error,
        showUnauthorized: loggedIn && loaded && !error && !authorized,
    };
}

// -----------------------------------------------------------------------------
// useTick
// -----------------------------------------------------------------------------

export function useTick(): void {
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 60_000);
        return () => clearInterval(id);
    }, []);
}
