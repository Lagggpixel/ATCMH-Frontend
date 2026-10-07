import {legacyDashboardSessionCookie, loopbackSessionCookie, sessionCookie} from "@/src/lib/central-auth";

type Fetch = typeof globalThis.fetch;
interface AccessOptions {
    backendOrigin: string;
    frontendOrigin: string;
    fetch?: Fetch;
    now?: number;
}

/** Live authorization only. No browser role claims or preview bypasses. */
export async function canOpenWraps(cookieHeader: string, options: AccessOptions): Promise<boolean> {
    try {
        const cookies = new Map(cookieHeader.split(";").map(part => {
            const [name, ...value] = part.trim().split("=");
            return [name, value.join("=")];
        }));
        const name = [sessionCookie, loopbackSessionCookie, legacyDashboardSessionCookie].find(key => cookies.get(key));
        if (!name) return false;
        const token = cookies.get(name)!;
        if (token.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(token)) return false;
        const backend = new URL(options.backendOrigin);
        if (backend.username || backend.password || (backend.protocol !== "https:"
            && !(backend.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname)))) return false;
        const headers = {Cookie: `${name}=${token}`, Origin: new URL(options.frontendOrigin).origin};
        const request = options.fetch ?? globalThis.fetch;
        const init: RequestInit = {headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000)};
        const [sessionResponse, adminResponse] = await Promise.all([
            request(new URL("/auth/me", backend), init),
            request(new URL("/admin/me", backend), init),
        ]);
        if (!sessionResponse.ok || !adminResponse.ok) return false;
        const [session, admin] = await Promise.all([sessionResponse.json(), adminResponse.json()]);
        return session?.application === "web" && session?.impersonating === false
            && typeof session.accountId === "string" && session.accountId.length > 0
            && typeof session.expiresAt === "string" && Date.parse(session.expiresAt) > (options.now ?? Date.now())
            && admin?.role === "super_admin" && typeof admin.id === "string" && admin.id.length > 0;
    } catch {
        // Missing configuration, expired sessions and unavailable auth all fail closed.
        return false;
    }
}
