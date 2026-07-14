import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { learnerAuthLabel, siteNavigation } from "@/src/lib/learner-site-content";
import { getVerifiedCentralSession } from "@/src/lib/learner-session";
import { AuthControls } from "./AuthControls";
import { privacyPolicyUrl, termsOfServiceUrl } from "@/src/lib/login-policy-content";
import "./exams.css";

export const metadata: Metadata = {
  title: "ATCMH Exam Center",
  description: "Mentorship and quiz resources for aspiring Infinite Flight Air Traffic Controllers.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getVerifiedCentralSession();
  const discordId = session?.discordId;
  return (
        <div className="learner-site">
          <header className="site-header">
            <div className="site-shell site-header__inner">
              <Link className="site-brand" href="/exams" aria-label="ATCMH Learning Mentorship Platform">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/exams/logo.png" alt="ATCMH logo" width="48" height="48" />
                <span className="site-brand__copy"><strong>ATCMH Learning</strong><small>Mentorship Platform</small></span>
              </Link>
              <nav className="site-navigation" aria-label="Primary navigation">
                {siteNavigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
                {discordId
                  ? <span aria-label="Discord learner session active">{learnerAuthLabel(discordId)}</span>
                  : null}
                <AuthControls signedIn={Boolean(discordId)} />
              </nav>
            </div>
          </header>
          {session?.impersonating ? <div className="impersonation-banner" role="status">Impersonating account {session.accountId}. Actions are attributed to the real administrator.</div> : null}
          {children}
          <footer className="site-footer">
            <div className="site-shell site-footer__inner">
              <div className="site-footer__legal">
                <span>ATCMH Exam Center</span>
                <span>Not affiliated with Infinite Flight.</span>
                <a href={termsOfServiceUrl}>Terms of Service</a>
                <a href={privacyPolicyUrl}>Privacy Policy</a>
                <span>© 2026 ATCMH. All rights reserved.</span>
              </div>
            </div>
          </footer>
        </div>
  );
}
