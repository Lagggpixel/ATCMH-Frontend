"use client";

import {useDashboard} from "./DashboardProvider";
import AccountPage from "./components/account/AccountPage";
import ConsentPage from "./components/consent/ConsentPage";
import {DiscordAuth} from "./components/discord/DiscordAuth";

export default function SharedDashboardPage({page}: {page: "auth" | "account" | "consent"}) {
    const {auth, adminUser} = useDashboard();
    if (page === "auth") return <DiscordAuth session={auth.session}/>;
    if (page === "consent") return <ConsentPage/>;
    return <AccountPage session={auth.session} loading={auth.loading} error={auth.error} canAccessAdmin={adminUser != null} onLogout={auth.logout}/>;
}
