
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {closeSimulatorStorage} from "../lib/simulator-db";
import {endlessPresets} from "./endless/definition";
import {ReplayTimeline} from "./replays";
import {createEndlessApi} from "./server/endless-api";
import {SessionService} from "./server/session-service";
import {sqlSessionStore} from "./server/session-store";
import {SessionError} from "./sessions";

test("private Endless sessions survive reload and archive one indexed replay across multiple hours", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sweatbox-endless-"));
  const path = join(directory, "endless.sqlite");
  execFileSync(process.execPath, ["storage/create-local-sweatbox-db.mjs", path], {stdio: "pipe"});
  const priorPath = process.env.SIMULATOR_SQLITE_PATH;
  process.env.SIMULATOR_SQLITE_PATH = path;
  try {
    const api = createEndlessApi(async (request, staff) => {
      const accountId = request.headers.get("test-actor") ?? "owner";
      if (accountId === "trainee") throw new SessionError("forbidden", "Staff required.", 403);
      return {accountId, staff};
    });
    const call = (suffix = "", body?: object, actor = "owner") => api(new Request("https://local.test/api/simulator/endless" + suffix, {
      method: body ? "POST" : "GET", headers: {"test-actor": actor}, ...(body ? {body: JSON.stringify(body)} : {}),
    }));
    const owner = {accountId: "owner", staff: true}, other = {accountId: "other", staff: true};
    const definition = endlessPresets.edinburgh;
    const saved = await call("", {action: "save", version: 0, definition}).then(response => response.json());
    assert.equal(saved.version, 1);
    assert.equal((await call("", {action: "save", id: saved.id, version: 0, definition})).status, 409);
    assert.deepEqual((await call("", undefined, "other").then(response => response.json())).custom, []);
    assert.equal((await call("", undefined, "trainee")).status, 403);

    const id = randomUUID(), input = {action: "launch", id, definition};
    assert.equal((await call("", input)).status, 200);
    assert.equal((await call("", input)).status, 200);
    assert.equal((await call("", input, "other")).status, 404);
    let now = Date.now();
    const sightings = {apply() {}, request() {}}, terrain = {apply: () => false, request() {}};
    const service = new SessionService(sqlSessionStore, () => now, randomUUID, sightings, terrain);
    const token = randomUUID();
    await assert.rejects(service.join(other, id, "staff", token), {code: "not-found"});
    await service.join(owner, id, "staff", token);
    await service.dispatch(owner, id, "staff", token, {id: randomUUID(), time: now, action: {kind: "play"}});
    for (let tick = 0; tick < 3; tick++) {
      now += 1000;
      await service.frame(owner, id, "staff", token);
    }
    await service.leave(owner, id, "staff", token);
    const before = (await sqlSessionStore.read(id)).exercise.elapsed;
    now += 3_600_000;
    const rejoined = await service.join(owner, id, "staff", randomUUID());
    assert.equal(rejoined.exercise.elapsed, before);
    assert.equal(rejoined.exercise.running, false);

    // Simulate persisted frame times spread over several hours without waiting for the simulation clock.
    for (let frame = 1; frame <= 130; frame++) {
      await sqlSessionStore.transaction(id, record => {
        record.exercise.elapsed = before + frame * 120;
        record.contentRevision++;
      });
    }
    assert.equal((await call("", {action: "end", id}, "other")).status, 404);
    const ended = await call("", {action: "end", id}).then(response => response.json());
    assert.equal(ended.replayId, id);
    assert.deepEqual(await call("", {action: "end", id}).then(response => response.json()), ended);
    const review = await call(`?replay=${id}`).then(response => response.json());
    assert.ok(review.duration > 4 * 3600);
    assert.equal(review.review.report.score, null);
    assert.equal((await call(`?replay=${id}`, undefined, "other")).status, 404);
    const seek = await call(`?replay=${id}&at=14400`).then(response => response.json());
    const {initial, frames, from, until} = seek.window;
    assert.ok(from > 0 && until >= 14400 && frames.length <= 120);
    assert.ok(Math.abs(new ReplayTimeline(initial, frames, from).at(14400).elapsed - 14400) < 121);
    assert.equal((await call().then(response => response.json())).runs.length, 0);
  } finally {
    await closeSimulatorStorage();
    if (priorPath === undefined) delete process.env.SIMULATOR_SQLITE_PATH;
    else process.env.SIMULATOR_SQLITE_PATH = priorPath;
    rmSync(directory, {recursive: true, force: true});
  }
});
