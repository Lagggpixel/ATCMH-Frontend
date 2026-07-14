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
