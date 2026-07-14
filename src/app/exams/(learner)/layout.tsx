import type {ReactNode} from "react";
import {getVerifiedCentralSession} from "@/src/lib/learner-session";
import SiteFrame from "@/src/platform/SiteFrame";

export default async function LearnerLayout({children}: Readonly<{children: ReactNode}>) {
  const session = await getVerifiedCentralSession();
  return <SiteFrame>
    <div className="learner-site">
      {session?.impersonating ? <div className="impersonation-banner" role="status">Impersonating account {session.accountId}. Actions are attributed to the real administrator.</div> : null}
      {children}
    </div>
  </SiteFrame>;
}
