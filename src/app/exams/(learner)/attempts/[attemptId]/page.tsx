import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAttemptResultForRoute } from "@/src/lib/attempt-service";
import { getAttemptByReference } from "@/src/lib/exams-repository";
import { getAttemptReview } from "@/src/lib/attempt-result";
import { AttemptReviewDetails } from "@/src/lib/attempt-review-details";
import { getVerifiedLearnerIdentity } from "@/src/lib/learner-session";
import { resolveLearnerAccess } from "@/src/lib/learner-access";
import {homeLoginHref} from "@/src/platform/auth/login-routing";

interface AttemptResultPageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function AttemptResultPage({ params }: AttemptResultPageProps) {
  const { attemptId } = await params;
  const resultPath = `/exams/attempts/${encodeURIComponent(attemptId)}`;
  const identity = await getVerifiedLearnerIdentity();
  if (!identity) redirect(homeLoginHref("exams", resultPath));
  const access = await resolveLearnerAccess(identity.discordId);
  let attempt;
  try {
    attempt = await getAttemptResultForRoute(
      { findAttempt: getAttemptByReference },
      attemptId,
      identity.discordId,
      access.canAccessPrivateQuizzes,
    );
  } catch {
    notFound();
  }
  const review = getAttemptReview(attempt.questionSnapshot);
  return (
    <main className="attempt-result-page">
      <article className="attempt-result-card" aria-labelledby="page-title">
        <header className="attempt-result-card__header">
          <p className="eyebrow">Quiz result</p>
          <h1 id="page-title">Your attempt</h1>
          <strong className="attempt-result-score" aria-label={`Score ${attempt.percentage} percent`}>{attempt.percentage}%</strong>
          <p className="attempt-result-message">Your result has been recorded.</p>
        </header>
        <dl className="attempt-result-stats">
          <div><dt>Correct answers</dt><dd>{attempt.score}</dd></div>
          <div><dt>Questions</dt><dd>{attempt.total}</dd></div>
          <div><dt>Submission</dt><dd>{attempt.submissionReason === "timeout" ? "Time expired" : "Manual"}</dd></div>
        </dl>
        <nav className="attempt-result-actions" aria-label="Attempt actions">
          <Link className="button button--primary" href="/exams/quizzes">Return to quizzes</Link>
          <Link className="button button--secondary" href={`/exams/quizzes/${encodeURIComponent(attempt.quizId)}`}>View quiz</Link>
        </nav>
        <details className="attempt-review">
          <summary>Show attempt</summary>
          <AttemptReviewDetails review={review} />
        </details>
      </article>
    </main>
  );
}
