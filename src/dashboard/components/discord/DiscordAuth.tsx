import {Navigate, useSearchParams} from "@/src/dashboard/next-navigation";
import type {DashboardAuthSession} from "../../types/Account.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import {
    loginPath,
    PRIVACY_POLICY_URL,
    safeDashboardReturnTo,
    TERMS_OF_SERVICE_URL,
} from "../../utils/AuthSessionUtils.ts";
import styles from "./DiscordAuth.module.css";

interface DiscordAuthProps {
    session: DashboardAuthSession | null;
}

export const DiscordAuth = ({session}: DiscordAuthProps) => {
    const [searchParams] = useSearchParams();
    const returnTo = safeDashboardReturnTo(searchParams.get("returnTo"));

    if (session) return <Navigate to={returnTo} replace/>;

    return <main className={styles.discordAuthContainer}>
        <div className={styles.loginCard}>
            <p className={styles.eyebrow}>ATCMH account</p>
            <h1>Sign in to Dashboard</h1>
            <div className={styles.providerActions}>
                <a href={loginPath(ApiUtils.apiOrigin, "discord", returnTo)} className={styles.discordLoginButton}>Continue with Discord</a>
                <a href={loginPath(ApiUtils.apiOrigin, "ifc", returnTo)} className={styles.ifcLoginButton}>Continue with Infinite Flight</a>
            </div>
            <p className={styles.legalDisclosure}>
                Before access is granted, you will need to agree to the <a href={TERMS_OF_SERVICE_URL}>Terms of Service</a> and acknowledge the <a href={PRIVACY_POLICY_URL}>Privacy Policy</a>.
            </p>
        </div>
    </main>;
};
