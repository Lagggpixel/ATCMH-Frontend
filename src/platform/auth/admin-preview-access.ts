import type {AdminUser} from "@/src/dashboard/types/AdminUser";

export function canViewAdminPreview(user: Pick<AdminUser, "role"> | undefined): boolean {
  return user?.role === "admin" || user?.role === "super_admin";
}

export function canAccessPilotGuide(user: Pick<AdminUser, "role" | "canManagePilotGuide"> | undefined): boolean {
  return canViewAdminPreview(user) || user?.canManagePilotGuide === true;
}
