import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("marks the canonical URL helper as server-only", () => {
  const source = readFileSync(new URL("./app-url.ts", import.meta.url), "utf8");
  assert.match(source, /^import ["']server-only["'];/);
});

test("validates the canonical origin and resolves only safe app paths", () => {
  const script = String.raw`
    import assert from "node:assert/strict";
    import { appUrl, getAppBaseUrl } from "./src/lib/app-url.ts";

    assert.equal(getAppBaseUrl({}).toString(), "http://localhost:3000/");
    assert.throws(() => getAppBaseUrl({ NODE_ENV: "production" }));
    assert.equal(getAppBaseUrl({ FRONTEND_PUBLIC_ORIGIN: "https://example.com/" }).toString(), "https://example.com/");
    assert.equal(getAppBaseUrl({ FRONTEND_PUBLIC_ORIGIN: "http://localhost:3000/" }).toString(), "http://localhost:3000/");
    assert.equal(getAppBaseUrl({ FRONTEND_PUBLIC_ORIGIN: "https://exams.example.com" }).toString(), "https://exams.example.com/");

    for (const value of [
      "",
      "https://user:pass@example.com",
      "https://example.com/path",
      "https://example.com?",
      "https://example.com?query=yes",
      "https://example.com#",
      "https://example.com#fragment",
      "http://example.com",
    ]) assert.throws(() => getAppBaseUrl({ FRONTEND_PUBLIC_ORIGIN: value }));

    const env = { FRONTEND_PUBLIC_ORIGIN: "https://example.com/" };
    assert.equal(appUrl("/exams/attempts/abc", env).toString(), "https://example.com/exams/attempts/abc");
    assert.equal(appUrl("/?page=2", env).toString(), "https://example.com/?page=2");

    for (const path of [
      "https://evil.example/path",
      "//evil.example/path",
      "/\\evil.example/path",
      "/line\nfeed",
      "relative/path",
    ]) assert.throws(() => appUrl(path, env));
  `;
  const result = spawnSync(process.execPath, [
    "--conditions=react-server",
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    script,
  ], { cwd: new URL("../..", import.meta.url), encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
