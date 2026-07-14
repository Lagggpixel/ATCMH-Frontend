import type {Metadata} from "next";
import type {ReactNode} from "react";
import {getVerifiedCentralSession} from "@/src/lib/learner-session";
import SiteFrame from "@/src/platform/SiteFrame";
import ExamLogoutButton from "@/src/platform/auth/ExamLogoutButton";
import "./exams.css";

export const metadata: Metadata = {
  title: "ATCMH Exam Center",
  description: "Mentorship and quiz resources for aspiring Infinite Flight Air Traffic Controllers.",
};

export default async function ExamsLayout({children}: Readonly<{children: ReactNode}>) {
  const session = await getVerifiedCentralSession();
  return <SiteFrame accountAccessory={session ? <ExamLogoutButton label={session.discordDisplayName ?? session.discordId}/> : undefined}>
    <div className="learner-site">
      {session?.impersonating ? <div className="impersonation-banner" role="status">Impersonating account {session.accountId}. Actions are attributed to the real administrator.</div> : null}
      {children}
    </div>
  </SiteFrame>;
}
