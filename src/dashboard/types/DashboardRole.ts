import type {AdminUser} from "./AdminUser";

export type DashboardRoleId = "ADMIN" | "SIMULATOR_TESTER";
export interface RoleMember {discordId: string; displayName: string;}
export interface DashboardRole {id: DashboardRoleId; name: string; description: string; members: RoleMember[];}

export function canManageRoles(user: AdminUser | undefined, impersonating = false) {
    return !impersonating && user?.role === "super_admin" && user.canManageRoles === true;
}
