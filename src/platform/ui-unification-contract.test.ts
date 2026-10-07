import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("marketing, leaderboard, exams, and Dashboard use the shared site shell", () => {
  for (const path of [
    "../marketing/Home.tsx",
    "../app/leaderboard/page.tsx",
    "../app/exams/(learner)/layout.tsx",
    "../app/dashboard/layout.tsx",
  ]) {
    assert.match(source(path), /SiteFrame|SiteHeader/);
  }
});

test("login controls exist only on the home surface", () => {
  assert.doesNotMatch(source("../dashboard/components/home/Home.tsx"), /Sign in|LoginProviderLinks/);
  assert.doesNotMatch(source("../app/exams/(learner)/page.tsx"), /LoginProviderLinks|Sign in to your exams/);
  assert.doesNotMatch(source("../app/exams/(learner)/quizzes/page.tsx"), /LoginProviderLinks|quiz-login-card/);
  assert.doesNotMatch(source("../app/exams/(learner)/quizzes/[quizId]/StartQuizButton.tsx"), /LoginProviderLinks/);
  assert.match(source("./auth/HomeLoginModal.tsx"), /Continue with Discord/);
});

test("Dashboard access is gated before DashboardRoute renders", () => {
  const layout = source("../app/dashboard/layout.tsx");
  const page = source("../app/dashboard/[[...segments]]/page.tsx");
  assert.match(layout, /<DashboardAccessGate>[\s\S]*<DashboardRuntime>\{children\}/);
  assert.match(page, /<DashboardRoute frontendVersion=\{version\}\/>/);
  assert.doesNotMatch(page, /DashboardAccessGate|DashboardRuntime|SiteFrame/);
});

test("shared authentication stays in the header without duplicating the navigation", () => {
  const header = source("../marketing/SiteHeader.tsx");
  const css = source("../marketing/marketing.css");

  assert.doesNotMatch(header, /Enroll Now|className="nav-cta"/);
  assert.match(header, /<nav className="nav-links"[^>]*><NavigationLinks\/><\/nav>/);
  assert.match(header, /<div className="nav-primary-auth"><AuthNavigation showLogin=\{showLogin\}\/><\/div>/);
  assert.match(header, /<nav aria-label="Mobile navigation"><NavigationLinks\/><\/nav>/);
  assert.match(header, /<details className="nav-user-menu">/);
  assert.match(header, /<AccountLink href="\/account">Account<\/AccountLink>/);
  assert.match(header, /showDashboard=\{state === "admin"\}/);
  assert.match(header, /Log out/);
  assert.match(css, /\.nav-user-menu summary\s*\{[^}]*width:\s*2\.75rem/s);
  assert.match(css, /@media \(max-width: 1080px\)[\s\S]*?\.site-header \.nav-primary-auth\s*\{[^}]*order:\s*4/s);
  assert.match(css, /\.nav-primary-auth \.nav-login\s*\{[^}]*color:\s*#07101d !important/s);
});

test("framed pages use the complete home navigation", () => {
  const header = source("../marketing/SiteHeader.tsx");
  const frame = source("./SiteFrame.tsx");

  assert.match(header, /\{label: "About", href: "\/#about"\}/);
  assert.match(header, /\{label: "Services", href: "\/#services"\}/);
  assert.match(header, /\{label: "Eligibility", href: "\/#eligibility"\}/);
  assert.doesNotMatch(header, /applicationNavLinks|navigation:\s*"marketing"\s*\|\s*"application"/);
  assert.doesNotMatch(header, />Contact<|>Legal</);
  assert.match(frame, /<SiteHeader[^>]*variant="solid"/);
  assert.doesNotMatch(frame, /navigation=/);
});

test("active Exam Center attempts remain outside the framed navigation", () => {
  const examsLayout = source("../app/exams/layout.tsx");
  const learnerLayout = source("../app/exams/(learner)/layout.tsx");
  const attemptLayout = source("../app/exams/(attempt)/layout.tsx");

  assert.doesNotMatch(examsLayout, /SiteFrame/);
  assert.match(learnerLayout, /<LearnerSiteFrame/);
  const learnerFrame = source("./LearnerSiteFrame.tsx");
  assert.match(learnerFrame, /<SiteFrame/);
  assert.match(learnerFrame, /pathname === "\/exams\/courses" \|\| pathname.startsWith\("\/exams\/courses\/"\)/);
  assert.match(learnerFrame, /<LearningFrame product="Courses">/);
  assert.doesNotMatch(learnerLayout, /ExamLogoutButton|Sign out|accountAccessory/);
  assert.doesNotMatch(attemptLayout, /SiteFrame/);
  assert.match(attemptLayout, /getVerifiedCentralSession/);
  assert.match(attemptLayout, /impersonation-banner/);
});

test("Exam Center is the task-first catalogue and the old catalogue URL redirects", () => {
  const landing = source("../app/exams/(learner)/page.tsx");
  const oldCatalogue = source("../app/exams/(learner)/quizzes/page.tsx");

  assert.match(landing, /<QuizCatalogue/);
  assert.doesNotMatch(landing, /exam-home-tabs|Exam Center content/);
  assert.doesNotMatch(landing, /homeStats|mentorshipSteps|Exam Roster|Mentorship Flow|Learning Pages|Current Notices/);
  assert.match(oldCatalogue, /redirect\("\/exams"\)/);
});
