import type {ReactNode} from "react";
import {getVerifiedCentralSession} from "@/src/lib/learner-session";

export default async function AttemptLayout({children}: Readonly<{children: ReactNode}>) {
  const session = await getVerifiedCentralSession();
  return <div className="learner-site">
    {session?.impersonating ? <div className="impersonation-banner" role="status">Impersonating account {session.accountId}. Actions are attributed to the real administrator.</div> : null}
    {children}
  </div>;
}
