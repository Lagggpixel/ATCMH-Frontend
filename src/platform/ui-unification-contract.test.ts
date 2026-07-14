import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("marketing, leaderboard, exams, and Dashboard use the shared site shell", () => {
  for (const path of [
    "../marketing/Home.tsx",
    "../app/leaderboard/page.tsx",
    "../app/exams/layout.tsx",
    "../app/dashboard/[[...segments]]/page.tsx",
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
  const page = source("../app/dashboard/[[...segments]]/page.tsx");
  assert.match(page, /DashboardAccessGate/);
  assert.match(page, /<DashboardAccessGate>[\s\S]*<DashboardRuntime>[\s\S]*<DashboardRoute/);
});

test("desktop authentication replaces the Enroll Now CTA without duplicating the center navigation", () => {
  const header = source("../marketing/SiteHeader.tsx");
  const css = source("../marketing/marketing.css");

  assert.doesNotMatch(header, /Enroll Now|className="nav-cta"/);
  assert.match(header, /<nav className="nav-links"[^>]*><NavigationLinks navigation=\{navigation\}\/><\/nav>/);
  assert.match(header, /<div className="nav-primary-auth"><AuthNavigation showLogin=\{showLogin\} accessory=\{accountAccessory\}\/><\/div>/);
  assert.match(header, /<nav aria-label="Mobile navigation"><NavigationLinks navigation=\{navigation\}\/><AuthNavigation showLogin=\{showLogin\} accessory=\{accountAccessory\}\/><\/nav>/);
  assert.match(css, /@media \(max-width: 1080px\)[\s\S]*?\.nav-primary-auth\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.nav-primary-auth \.nav-login\s*\{[^}]*color:\s*#07101d !important/s);
});

test("inner pages use a reduced contextual navbar while home keeps marketing anchors", () => {
  const header = source("../marketing/SiteHeader.tsx");
  const frame = source("./SiteFrame.tsx");

  assert.match(header, /navigation:\s*"marketing"\s*\|\s*"application"/);
  assert.match(header, /navigation === "marketing"/);
  assert.doesNotMatch(header, />Contact<|>Legal</);
  assert.match(frame, /<SiteHeader[^>]*navigation="application"/);
});

test("Exam Center is the task-first catalogue and the old catalogue URL redirects", () => {
  const landing = source("../app/exams/(learner)/page.tsx");
  const oldCatalogue = source("../app/exams/(learner)/quizzes/page.tsx");

  assert.match(landing, /<QuizCatalogue/);
  assert.doesNotMatch(landing, /homeStats|mentorshipSteps|Exam Roster|Mentorship Flow|Learning Pages|Current Notices/);
  assert.match(oldCatalogue, /redirect\("\/exams"\)/);
});
