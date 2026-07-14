import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuizForLearner, listPublicQuizzes } from "@/src/lib/exams-repository";
import { getVerifiedLearnerIdentity } from "@/src/lib/learner-session";
import { resolveLearnerAccess } from "@/src/lib/learner-access";
import { StartQuizButton } from "./StartQuizButton";

interface QuizPageProps {
  params: Promise<{ quizId: string }>;
}

export default async function QuizDetailPage({ params }: QuizPageProps) {
  const { quizId } = await params;
  const identity = await getVerifiedLearnerIdentity();
  const access = identity ? await resolveLearnerAccess(identity.discordId) : undefined;
  const quiz = access
    ? await getQuizForLearner(quizId, access).catch(() => null)
    : (await listPublicQuizzes()).find((candidate) => candidate.id === quizId) ?? null;
  if (!quiz) notFound();
  return (
    <main className="learner-main">
      <div className="site-shell quiz-detail-page">
        <section className="content-card quiz-detail-card" aria-labelledby="page-title">
          <p className="eyebrow">Quiz</p>
          <h1 id="page-title">{quiz.title}</h1>
          <p className="quiz-detail-card__description">{quiz.description}</p>
          <p className="quiz-detail-card__time">{quiz.timeLimitSeconds > 0 ? `Time limit: ${Math.ceil(quiz.timeLimitSeconds / 60)} minutes.` : "No time limit."}</p>
          <div className="quiz-detail-card__actions">
            <StartQuizButton quizId={quizId} />
            <Link className="quiz-detail-card__back" href="/exams/quizzes">Back to catalogue</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
