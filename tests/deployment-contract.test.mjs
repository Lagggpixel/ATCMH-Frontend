import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

test("Next emits standalone output and browser security headers", () => {
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /output:\s*"standalone"/);
  for (const header of ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) {
    assert.match(config, new RegExp(header));
  }
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
  assert.doesNotMatch(example, /NEXT_PUBLIC_.*(?:SECRET|TOKEN|KEY|PASSWORD)/i);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
});
