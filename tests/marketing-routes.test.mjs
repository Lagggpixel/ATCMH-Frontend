import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import test from "node:test";

test("RootSite marketing and legal content is owned by App Router routes", () => {
  for (const route of ["src/app/page.tsx", "src/app/terms/page.tsx", "src/app/policy/page.tsx"]) {
    assert.equal(existsSync(new URL(`../${route}`, import.meta.url)), true, route);
  }
  const terms = readFileSync(new URL("../src/app/terms/page.tsx", import.meta.url), "utf8");
  const policy = readFileSync(new URL("../src/app/policy/page.tsx", import.meta.url), "utf8");
  assert.match(terms, /TERMS_OF_SERVICE\.md/);
  assert.match(policy, /PRIVACY\.md/);
});

test("the unified app intentionally has no apply route", () => {
  assert.equal(existsSync(new URL("../src/app/apply", import.meta.url)), false);
});

test("the root navbar links to Leaderboard and permission-gates Dashboard in the account menu", () => {
  const header = readFileSync(new URL("../src/marketing/SiteHeader.tsx", import.meta.url), "utf8");
  assert.match(header, /\{label: "Leaderboard", href: "\/leaderboard"\}/);
  assert.match(header, /<details className="nav-user-menu">/);
  assert.match(header, /\{showDashboard \? <Link href="\/dashboard">Dashboard<\/Link> : null\}/);
  assert.equal(existsSync(new URL("../src/app/leaderboard/page.tsx", import.meta.url)), true);
});
