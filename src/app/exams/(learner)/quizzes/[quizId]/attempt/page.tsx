import { notFound, redirect } from "next/navigation";
import { getQuizForLearner } from "@/src/lib/exams-repository";
import { getVerifiedLearnerIdentity } from "@/src/lib/learner-session";
import AttemptForm from "./AttemptForm";
import { toAttemptQuestions } from "./attempt-form-model";
import { getVerifiedAttemptStart } from "@/src/lib/attempt-start-session";
import { orderAttemptQuestions } from "@/src/lib/attempt-start-contract";
import { resolveLearnerAccess } from "@/src/lib/learner-access";

interface AttemptPageProps {
  params: Promise<{ quizId: string }>;
}

export default async function QuizAttemptPage({ params }: AttemptPageProps) {
  const { quizId } = await params;
  const attemptPath = `/exams/quizzes/${encodeURIComponent(quizId)}/attempt`;
  const identity = await getVerifiedLearnerIdentity();
  if (!identity) redirect(`/exams/api/auth/discord/user/login?returnTo=${encodeURIComponent(attemptPath)}`);
  const access = await resolveLearnerAccess(identity.discordId);
  const quiz = await getQuizForLearner(quizId, access).catch(() => null);
  if (!quiz) notFound();
  const attemptStart = await getVerifiedAttemptStart(identity.discordId, quiz.id);
  if (!attemptStart) redirect(`/exams/quizzes/${encodeURIComponent(quiz.id)}`);
  const questions = orderAttemptQuestions(quiz.questions, quiz.randomizeQuestions, attemptStart.nonce);
  return (
    <main aria-labelledby="page-title" className="attempt-page">
      <AttemptForm deadline={attemptStart.deadline} quizId={quiz.id} quizTitle={quiz.title} questions={toAttemptQuestions(questions)} />
    </main>
  );
}
