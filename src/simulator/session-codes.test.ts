import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {SessionService} from "./server/session-service";
import {createSessionApi} from "./server/session-api";
import {MemoryStore} from "./session-test-store";
import {blankScenario, createScenarioExercise} from "./scenarios";
import {sessionCode, SessionError} from "./sessions";

test("short codes resolve case-insensitively, enforce mentee binding and reject ambiguous codes", async () => {
  const store = new MemoryStore(), staff = {accountId: "10001", staff: true}, learner = {accountId: "10002", staff: false};
  const service = new SessionService(store);
  const created = createScenarioExercise(blankScenario(), "pending", randomUUID()); created.runtime.learnerId = learner.accountId;
  const session = await service.create(staff, "Bound scenario", created.exercise, created.runtime);
  assert.deepEqual(await service.resolveCode(learner, sessionCode(session.id).toLowerCase()), {sessionId: session.id});
  await assert.rejects(service.resolveCode({accountId: "10003", staff: false}, sessionCode(session.id)), /different mentee/);
  await assert.rejects(service.resolveCode(learner, "EGPH-________"), /valid session code/);
  await assert.rejects(service.resolveCode(learner, "EGPH-ffffffff"), /unavailable/);
  const duplicate = structuredClone(store.records.get(session.id)!); duplicate.id = session.id.slice(0, 8) + randomUUID().slice(8);
  store.records.set(duplicate.id, duplicate);
  await assert.rejects(service.resolveCode(learner, sessionCode(session.id)), /mentee link/);
});

test("code lookup authenticates the mentee without granting session-list access", async () => {
  const store = new MemoryStore(), service = new SessionService(store);
  const session = await service.create({accountId: "10001", staff: true}, "Premade session");
  const api = createSessionApi(store, async (request, staff) => {
    if (!request.headers.has("cookie")) throw new SessionError("unauthorized", "Sign in", 401);
    if (staff) throw new SessionError("forbidden", "Staff only", 403);
    return {accountId: "10002", staff: false};
  });
  const url = `https://atcmh.test/api/simulator/sessions?code=${sessionCode(session.id)}`;
  assert.equal((await api.sessionCollection(new Request(url))).status, 401);
  const response = await api.sessionCollection(new Request(url, {headers: {cookie: "mentee"}}));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), {sessionId: session.id});
  assert.equal((await api.sessionCollection(new Request("https://atcmh.test/api/simulator/sessions", {headers: {cookie: "mentee"}}))).status, 403);
});
