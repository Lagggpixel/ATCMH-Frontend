import type {AdminUser} from "../dashboard/types/AdminUser";

export function simulatorEnabled(environment: {SIMULATOR_ENABLED?: string}) {return environment.SIMULATOR_ENABLED === "true";}

export function canAccessStaffSimulator(user: Pick<AdminUser, "role" | "canManageAllAssignments" | "canAccessSimulator"> | undefined) {
  // An explicit server decision takes precedence, including permission revocation.
  if (user?.canAccessSimulator !== undefined) return user.canAccessSimulator === true;
  return user?.canManageAllAssignments === true || user?.role === "admin" || user?.role === "super_admin";
}
