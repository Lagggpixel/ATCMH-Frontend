import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import test from "node:test";
import {fileURLToPath} from "node:url";

function renderedSecurityHeaders(nodeEnv, dashboardApiUrl) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval",
    "const {securityHeadersFor}=await import('./src/lib/security-headers.ts'); console.log(JSON.stringify(securityHeadersFor(process.env, process.env.NODE_ENV)));"], {
    cwd: root, encoding: "utf8", env: {...process.env, NODE_ENV: nodeEnv, DASHBOARD_API_URL: dashboardApiUrl,
      FRONTEND_PUBLIC_ORIGIN: nodeEnv === "production" ? "https://atcmh.org" : "http://localhost:3000"},
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("Next emits standalone output and browser security headers", () => {
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  const proxyUrl = new URL("../proxy.ts", import.meta.url);
  assert.equal(existsSync(proxyUrl), true, "runtime security proxy must exist");
  const proxy = readFileSync(proxyUrl, "utf8");
  const security = readFileSync(new URL("../src/lib/security-headers.ts", import.meta.url), "utf8");
  assert.match(config, /output:\s*"standalone"/);
  for (const header of ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) {
    assert.match(`${proxy}\n${security}`, new RegExp(header));
  }
});

test("security headers use the configured Dashboard API and enable transport hardening only in production", () => {
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.doesNotMatch(config, /DASHBOARD_API_URL|Content-Security-Policy/);

  const development = renderedSecurityHeaders("development", "http://localhost:3001");
  const developmentCsp = development.find(({key}) => key === "Content-Security-Policy")?.value ?? "";
  assert.match(developmentCsp, /connect-src 'self' http:\/\/localhost:3001/);
  assert.doesNotMatch(developmentCsp, /upgrade-insecure-requests/);
  assert.equal(development.some(({key}) => key === "Strict-Transport-Security"), false);

  const production = renderedSecurityHeaders("production", "https://dashboard-api.atcmh.org");
  const productionCsp = production.find(({key}) => key === "Content-Security-Policy")?.value ?? "";
  assert.match(productionCsp, /connect-src 'self' https:\/\/dashboard-api.atcmh.org/);
  assert.match(productionCsp, /upgrade-insecure-requests/);
  assert.equal(production.some(({key}) => key === "Strict-Transport-Security"), true);
});

test("container runs standalone Next as non-root and healthchecks the global route", () => {
  const dockerfile = readFileSync(new URL("../.dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /USER nextjs/);
  assert.match(dockerfile, /\/api\/health/);
  assert.doesNotMatch(dockerfile, /ARG\s+.*(?:SECRET|TOKEN|KEY|PASSWORD)/i);
});

test("environment examples and ignores contain no public secret channel", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(example, /FRONTEND_PUBLIC_ORIGIN=/);
  assert.match(example, /DASHBOARD_API_URL=/);
  assert.match(example, /^DASHBOARD_AUTH_URL=http:\/\/localhost:3001$/m);
  assert.match(example, /^EXAMS_AUDIT_INGEST_URL=http:\/\/localhost:3001$/m);
  assert.doesNotMatch(example, /NEXT_PUBLIC_.*(?:SECRET|TOKEN|KEY|PASSWORD)/i);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
});

test("Frontend contract tests do not read sibling repositories", () => {
  const contract = readFileSync(new URL("../src/lib/cross-service-auth-contract.test.ts", import.meta.url), "utf8");
  assert.doesNotMatch(contract, /Dashboard-Backend|\.\.\/\.\.\/\.\.\/Dashboard/);
});
