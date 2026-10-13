import {ApiUtils} from "./ApiUtils";
import type {DashboardRole, DashboardRoleId, RoleMember} from "../types/DashboardRole";

async function request<T>(path: string, csrfToken: string | null, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${ApiUtils.apiOrigin}/admin/roles${path}`, {
        ...options, credentials: "include", cache: "no-store",
        headers: {"Content-Type": "application/json", ...(options.method && options.method !== "GET" && csrfToken ? {"X-CSRF-Token": csrfToken} : {})},
    });
    if (!response.ok) {
        let message = response.status === 403 ? "Superadmin access is required. Refresh your permissions and try again." : "Role membership could not be updated. Please try again.";
        try {const body = await response.json(); if (typeof body.error === "string") message = body.error;} catch { /* Use the safe fallback. */ }
        throw new Error(message);
    }
    return response.json() as Promise<T>;
}

export const RoleApi = {
    list: (signal?: AbortSignal) => request<DashboardRole[]>("", null, {signal}),
    candidates: (query: string, signal?: AbortSignal) => request<RoleMember[]>(`/candidates?q=${encodeURIComponent(query)}`, null, {signal}),
    add: (role: DashboardRoleId, member: RoleMember, token: string) => request<{changed: boolean; members: RoleMember[]}>(`/${role}/members`, token, {method: "PUT", body: JSON.stringify({discordId: member.discordId})}),
    remove: (role: DashboardRoleId, member: RoleMember, token: string) => request<{changed: boolean; members: RoleMember[]}>(`/${role}/members/${encodeURIComponent(member.discordId)}`, token, {method: "DELETE"}),
};
