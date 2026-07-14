import Link from "next/link";
import { redirect } from "next/navigation";
import { homeStats, mentorshipSteps } from "@/src/lib/learner-site-content";
import { handoffCallbackPath } from "@/src/lib/central-auth";
import {homeLoginHref} from "@/src/platform/auth/login-routing";

export default async function LearnerHomePage({ searchParams }: { searchParams: Promise<{ authError?: string; handoff?: string }> }) {
  const query = await searchParams;
  const callback = handoffCallbackPath(query.handoff);
  if (callback) redirect(callback);
  const authError = query.authError;
  if (authError) redirect(`${homeLoginHref("exams", "/exams")}&authError=${encodeURIComponent(authError)}`);
  return (
    <main className="learner-main">
      <div className="site-shell home-page">
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
