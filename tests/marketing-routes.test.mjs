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

test("homepage embeds use the ATCMH logo instead of an externally hosted brand image", () => {
  const homepage = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.match(homepage, /https:\/\/atcmh\.org\/dashboard-icon\.png/);
  assert.match(homepage, /alt: "ATC Mentorship Hub logo"/);
  assert.doesNotMatch(homepage, /postimg\.cc/);
});

test("the unified app exposes the canonical website application route", () => {
  assert.equal(existsSync(new URL("../src/app/apply/page.tsx", import.meta.url)), true);
  const application = readFileSync(new URL("../src/apply/ApplicationPage.tsx", import.meta.url), "utf8");
  assert.match(application, /Apply to ATCMH/);
  assert.match(application, /Restart the entire application in Discord/);
});

test("the root navbar links to Leaderboard and permission-gates Dashboard in the account menu", () => {
  const header = readFileSync(new URL("../src/marketing/SiteHeader.tsx", import.meta.url), "utf8");
  assert.match(header, /\{label: "Leaderboard", href: "\/leaderboard"\}/);
  assert.match(header, /<details className="nav-user-menu">/);
  assert.match(header, /\{showDashboard \? <Link href="\/dashboard">Dashboard<\/Link> : null\}/);
  assert.equal(existsSync(new URL("../src/app/leaderboard/page.tsx", import.meta.url)), true);
});
