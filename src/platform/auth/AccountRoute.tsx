"use client";

import AccountPage from "@/src/dashboard/components/account/AccountPage";
import {usePortalAuth} from "./PortalAuthProvider";

export default function AccountRoute() {
  const auth = usePortalAuth();
  return <AccountPage session={auth.session} loading={auth.loading} error={auth.error} onLogout={auth.logout}/>;
}
