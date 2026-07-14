import type {DashboardAuthSession} from "../../types/Account.ts";

export type AccountPageState = {kind: "loading"} | {kind: "signed-out"; authMessage?: string; error?: string | null} |
    {kind: "account"; accountId: string; status: string; discord?: string; ifc?: string; expiresAt: string};
export const accountPageState = (session: DashboardAuthSession | null, loading: boolean, error: string | null | undefined, authError: string | null): AccountPageState => {
    if (loading) return {kind: "loading"};
    if (!session) return {kind: "signed-out", authMessage: accountAuthErrorMessage(authError), error};
    const identity = (provider: string) => session.identities.find(item => item.provider.toLowerCase() === provider);
    const display = (provider: string) => {const item=identity(provider);return item ? item.displayName || item.subject : undefined;};
    return {kind: "account", accountId: session.accountId, status: session.status ?? "Unavailable", discord: display("discord"), ifc: display("ifc"), expiresAt: session.expiresAt};
};
export const accountStatusLabel = (status: string | undefined) => status ? status.toLowerCase().replace(/(^|_)\w/g, match => match.replace("_", " ").toUpperCase()) : "Unavailable";
export const accountAuthErrorMessage = (code: string | null) => {
    switch (code) {
        case "link_conflict": return "These identities are already linked to different accounts. Nothing was changed. Please contact support for review.";
        case "cancelled": return "Sign-in was cancelled. No account changes were made. You can try again when ready.";
        case "provider_failure": return "The identity provider could not verify your sign-in. Please try again. If the problem continues, contact support.";
        case "consent_declined": return "You did not agree to the required policies, so you remain signed out. You can sign in again when ready.";
        case "invalid_consent": return "This policy agreement request is invalid. Please start sign-in again.";
        case "consent_expired": return "This policy agreement request has expired. Please start sign-in again.";
        default: return undefined;
    }
};
