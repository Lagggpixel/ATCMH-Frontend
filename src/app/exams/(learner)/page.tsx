import { redirect } from "next/navigation";
import Link from "next/link";
import {homeLoginHref} from "@/src/platform/auth/login-routing";
import { listEligibleQuizzes, listPublicQuizzes } from "@/src/lib/exams-repository";
import { getVerifiedLearnerDiscordSubject } from "@/src/lib/learner-session";
import { resolveLearnerAccess } from "@/src/lib/learner-access";
import QuizCatalogue from "./QuizCatalogue";
import DashboardExamSessionBootstrap from "./DashboardExamSessionBootstrap";

export const dynamic = "force-dynamic";

async function loadExamCatalogue() {
  const discordId = await getVerifiedLearnerDiscordSubject();
  const access = discordId ? await resolveLearnerAccess(discordId) : undefined;
  const quizzes = access ? await listEligibleQuizzes(access) : await listPublicQuizzes();
  return { quizzes, showVisibility: access?.canAccessPrivateQuizzes === true, unavailable: false };
}

export default async function LearnerHomePage({ searchParams }: { searchParams: Promise<{ authError?: string }> }) {
  const query = await searchParams;
  const authError = query.authError;
  if (authError) redirect(`${homeLoginHref("exams", "/exams")}&authError=${encodeURIComponent(authError)}`);
  const catalogue = await loadExamCatalogue().catch(() => ({ quizzes: [], showVisibility: false, unavailable: true }));
  return (
    <main className="learner-main">
      <div className="site-shell exam-home">
        <DashboardExamSessionBootstrap />
        <section className="exam-intro" aria-labelledby="page-title">
          <div>
            <h1 id="page-title">Exam Center</h1>
            <p>Choose a quiz to begin.</p>
          </div>
        </section>
        <nav className="exam-home-tabs" aria-label="Exam Center content"><Link href="/exams" aria-current="page">Quizzes</Link><Link href="/exams/courses">Courses</Link></nav>
        <QuizCatalogue {...catalogue} />
      </div>
    </main>
  );
}
