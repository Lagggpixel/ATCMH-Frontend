import Link from "next/link";
import { listEligibleQuizzes, listPublicQuizzes } from "@/src/lib/exams-repository";
import { getVerifiedLearnerDiscordSubject } from "@/src/lib/learner-session";
import { resolveLearnerAccess } from "@/src/lib/learner-access";
import { quizCatalogueTitle } from "@/src/lib/learner-site-content";

/**
 * Catalogue data is attached after Discord session handoff is configured.  The
 * page deliberately contains no client supplied learner ID: private content
 * must only be resolved by a verified server-side session.
 */
export const dynamic = "force-dynamic";

export default async function QuizCataloguePage() {
  const discordId = await getVerifiedLearnerDiscordSubject();
  const access = discordId ? await resolveLearnerAccess(discordId) : undefined;
  const quizzes = access ? await listEligibleQuizzes(access) : await listPublicQuizzes();
  const showVisibility = access?.canAccessPrivateQuizzes === true;
  return (
    <main className="learner-main">
      <section className="site-shell quizzes-page" aria-labelledby="page-title">
        <h1 id="page-title">{quizCatalogueTitle}</h1>
        {quizzes.length === 0 && discordId ? <p className="empty">No quizzes are available right now.</p> : null}
        {quizzes.length > 0 ? (
          <ul className="quiz-card-grid">
            {quizzes.map((quiz) => (
              <li className="quiz-card" key={quiz.id}>
                <Link className="quiz-card__link" href={`/exams/quizzes/${quiz.id}`}>
                  <span className="quiz-card__meta">
                    <span className="quiz-card__category">{quiz.category}</span>
                    {showVisibility ? (
                      <span className={`quiz-visibility-badge quiz-visibility-badge--${quiz.isPrivate ? "private" : "public"}`}>
                        {quiz.isPrivate ? "Private" : "Public"}
                      </span>
                    ) : null}
                  </span>
                  <h2>{quiz.title}</h2>
                  <span className="quiz-card__description">{quiz.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
