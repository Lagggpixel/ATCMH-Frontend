import type {ReactNode} from "react";
import {getVerifiedCentralSession} from "@/src/lib/learner-session";
import LearningFrame from "@/src/learning/LearningFrame";
import GroundSchoolChatHost from "@/src/ground-school/GroundSchoolChatHost";
import "@/src/app/exams/exams.css";

export default async function GroundSchoolLayout({children}: Readonly<{children: ReactNode}>) {
    const session = await getVerifiedCentralSession();
    return <LearningFrame product="Ground School">
        <div className="learner-site">
            {session?.impersonating ? <div className="impersonation-banner" role="status">Impersonating account {session.accountId}. Actions are attributed to the real administrator.</div> : null}
            {children}
        </div>
        <GroundSchoolChatHost/>
    </LearningFrame>;
}
