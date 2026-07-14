import Link from "next/link";
import { redirect } from "next/navigation";
import { homeStats, mentorshipSteps } from "@/src/lib/learner-site-content";
import { handoffCallbackPath } from "@/src/lib/central-auth";
import { getVerifiedCentralSession } from "@/src/lib/learner-session";
import { loginConsentMessage } from "@/src/lib/login-policy-content";
import { LoginProviderLinks } from "../AuthControls";

export default async function LearnerHomePage({ searchParams }: { searchParams: Promise<{ authError?: string; handoff?: string }> }) {
  const query = await searchParams;
  const callback = handoffCallbackPath(query.handoff);
  if (callback) redirect(callback);
  const authError = query.authError;
  const consentMessage = loginConsentMessage(authError);
  const session = await getVerifiedCentralSession();
  return (
    <main className="learner-main">
      <div className="site-shell home-page">
        {authError === "link_conflict" ? <section className="content-card auth-state auth-state--error" role="alert"><h2>Account link needs review</h2><p>Your Infinite Flight and Discord identities are linked to different accounts. No links were changed. Please contact ATCMH support for review.</p></section> : null}
        {authError === "invalid_handoff" ? <section className="content-card auth-state auth-state--error" role="alert"><h2>Login could not be completed</h2><p>The one-time login expired or was already used. Start a new login below.</p></section> : null}
        {authError === "cancelled" ? <section className="content-card auth-state" role="status"><h2>Login cancelled</h2><p>No account changes were made. You can retry with either provider below.</p></section> : null}
        {authError === "provider_failure" ? <section className="content-card auth-state auth-state--error" role="alert"><h2>Identity provider unavailable</h2><p>Your identity could not be verified. Please retry later or contact support if this continues.</p></section> : null}
        {consentMessage ? <section className="content-card auth-state auth-state--error" role="alert"><h2>{consentMessage.title}</h2><p>{consentMessage.message}</p></section> : null}
        <section className="hero-card" aria-labelledby="page-title">
          <div className="hero-card__image" aria-hidden="true" />
          <div className="hero-card__content">
            <p className="exam-chip">Exam Center</p>
            <h1 id="page-title">ATCMH Exam Center</h1>
            <p>Mentorship and quiz resources for aspiring Infinite Flight Air Traffic Controllers.</p>
          </div>
          <div className="stats-grid">
            {homeStats.map((stat) => (
              <article key={stat.label} className="stat-card">
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
              </article>
            ))}
          </div>
        </section>

        {!session ? <section className="content-card auth-choice" aria-labelledby="auth-choice-title">
          <h2 id="auth-choice-title">Sign in to your exams</h2>
          <p>Use either identity. If your Infinite Flight account is not linked yet, you will be asked to continue with Discord before access is granted.</p>
          <LoginProviderLinks />
        </section> : null}

        <section className="content-card roster-card" aria-labelledby="roster-title">
          <div className="section-heading">
            <h2 id="roster-title">Exam Roster</h2>
            <Link href="/exams/quizzes">View all quizzes</Link>
          </div>
          <p>No quizzes published yet.</p>
        </section>

        <section className="content-card mentorship-card" aria-labelledby="flow-title">
          <h2 id="flow-title">Mentorship Flow</h2>
          <ol className="flow-grid">
            {mentorshipSteps.map((step, index) => (
              <li key={step.title} className="flow-card">
                <p>Step {index + 1}</p>
                <h3>{step.title}</h3>
                <span>{step.description}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
