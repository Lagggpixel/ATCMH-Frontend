import { redirect } from "next/navigation";
import { handoffCallbackPath } from "@/src/lib/central-auth";
import {homeLoginHref} from "@/src/platform/auth/login-routing";
import { listEligibleQuizzes, listPublicQuizzes } from "@/src/lib/exams-repository";
import { getVerifiedLearnerDiscordSubject } from "@/src/lib/learner-session";
import { resolveLearnerAccess } from "@/src/lib/learner-access";
import QuizCatalogue from "./QuizCatalogue";

export const dynamic = "force-dynamic";

async function loadExamCatalogue() {
  const discordId = await getVerifiedLearnerDiscordSubject();
  const access = discordId ? await resolveLearnerAccess(discordId) : undefined;
  const quizzes = access ? await listEligibleQuizzes(access) : await listPublicQuizzes();
  return { quizzes, showVisibility: access?.canAccessPrivateQuizzes === true, unavailable: false };
}

export default async function LearnerHomePage({ searchParams }: { searchParams: Promise<{ authError?: string; handoff?: string }> }) {
  const query = await searchParams;
  const callback = handoffCallbackPath(query.handoff);
  if (callback) redirect(callback);
  const authError = query.authError;
  if (authError) redirect(`${homeLoginHref("exams", "/exams")}&authError=${encodeURIComponent(authError)}`);
  const catalogue = await loadExamCatalogue().catch(() => ({ quizzes: [], showVisibility: false, unavailable: true }));
  return (
    <main className="learner-main">
      <div className="site-shell exam-home">
        <section className="exam-intro" aria-labelledby="page-title">
          <div>
            <p className="exam-intro__eyebrow">ATCMH learning</p>
            <h1 id="page-title">Exam Center</h1>
            <p>Open an available quiz and build the knowledge you need to become a confident Infinite Flight air traffic controller.</p>
          </div>
        </section>
        <QuizCatalogue {...catalogue} />
      </div>
    </main>
  );
}
