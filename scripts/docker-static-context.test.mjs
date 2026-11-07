import assert from "node:assert/strict";
import test from "node:test";
import {mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {runDockerBuild} from "./docker-build.mjs";
import {randomUUID} from "node:crypto";

test("configured immutable static context reaches the Docker build without another image build", () => {
  const previous = process.env.RELEASE_STATIC_ARCHIVE;
  const archive = resolve("build/static-context-test");
  mkdirSync(archive, {recursive: true});
  try {
    process.env.RELEASE_STATIC_ARCHIVE = archive;
    const calls = [];
    assert.equal(runDockerBuild({options: [], run(command, args) {calls.push({command, args}); return {status: 0};}}), 0);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].args.includes("previous-static-assets=" + archive));
    assert.ok(calls[0].args.includes("linux/amd64"));
  } finally {if (previous === undefined) delete process.env.RELEASE_STATIC_ARCHIVE; else process.env.RELEASE_STATIC_ARCHIVE = previous;}
});

test("a missing configured archive stops before Docker can build an incomplete image", () => {
  const previous = process.env.RELEASE_STATIC_ARCHIVE;
  try {
    process.env.RELEASE_STATIC_ARCHIVE = resolve("build/missing-static-" + randomUUID());
    assert.throws(() => runDockerBuild({options: [], run() {throw new Error("Docker must not run");}}), /Configured static archive is missing/);
  } finally {if (previous === undefined) delete process.env.RELEASE_STATIC_ARCHIVE; else process.env.RELEASE_STATIC_ARCHIVE = previous;}
});
