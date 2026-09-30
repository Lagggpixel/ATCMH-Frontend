import type {AdminUser} from "@/src/dashboard/types/AdminUser";

export function canViewAdminPreview(user: Pick<AdminUser, "role"> | undefined): boolean {
  return user?.role === "admin" || user?.role === "super_admin";
}
