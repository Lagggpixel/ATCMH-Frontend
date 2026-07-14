import type {AdminUser} from "../types/AdminUser.ts";

export interface SessionBoundAdminUser {
    token: string;
    user: AdminUser;
}

export const resolveAdminUserForSession = (
    authorized: SessionBoundAdminUser | undefined,
    currentToken: string | null,
): AdminUser | undefined => authorized?.token === currentToken && currentToken != null ? authorized.user : undefined;
