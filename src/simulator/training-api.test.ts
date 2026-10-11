import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createTrainingApi, type TrainingOperations} from "./server/training-api";
import {SessionError} from "./sessions";
import {safeLoginReturnTo} from "../platform/auth/login-routing";

test("training APIs authenticate reads, require staff for mutations and validate payloads", async () => {
  const calls: {method: string; staff: boolean}[] = [];
  const api = createTrainingApi({assignments: async () => [], scenarios: async () => [], assign: async () => ({id: randomUUID()})} as unknown as TrainingOperations, async (request, staff) => {
    calls.push({method: request.method, staff});
    if (!request.headers.has("cookie")) throw new SessionError("unauthorized", "Sign in", 401);
    if (staff && request.headers.get("cookie") !== "staff") throw new SessionError("forbidden", "Moderator access required", 403);
    return {accountId: "10001", staff};
  });
  const req = (path: string, method = "GET", cookie = "student", body?: object) => new Request(`https://atcmh.test/api/simulator/training/${path}`, {method, headers: {cookie, "content-type": "application/json"}, ...(body ? {body: JSON.stringify(body)} : {})});
  assert.equal((await api(req("assignments"), "assignments")).status, 200); assert.equal(calls.at(-1)!.staff, false);
  assert.equal((await api(req("assignments?role=staff"), "assignments")).status, 403);
  assert.equal((await api(req("scenarios"), "scenarios")).status, 403);
  assert.equal((await api(req("assignments", "POST", "student", {}), "assignments")).status, 403);
  assert.equal((await api(req("assignments", "POST", "staff", {scenarioId: randomUUID(), revision: 1, learnerId: "not an account", maxAttempts: 3, dueAt: null}), "assignments")).status, 400);
  assert.equal((await api(req("assignments", "POST", "staff", {scenarioId: randomUUID(), revision: 1, learnerId: "10002", maxAttempts: 3, dueAt: null}), "assignments")).status, 200);
  assert.equal((await api(req("scenarios", "POST", "staff", {draft: {}}), "scenarios")).status, 400);
  assert.equal((await api(req("attempts", "POST", "staff", {action: "finish", feedback: ""}), "attempts", randomUUID())).status, 400);
});
test("new simulator authoring and assignment routes survive sign-in without broadening arbitrary returns", () => {
  for (const path of ["/simulator/scenarios", "/simulator/scenarios/new", `/simulator/scenarios/${randomUUID()}`, "/simulator/assignments", "/simulator/mentee/assignments"]) assert.equal(safeLoginReturnTo("dashboard", path), path);
  for (const path of ["/simulator/scenarios/not-a-uuid", "/simulator/scenarios/new/extra", "/simulator/assignments/secret", "//evil.test/simulator/scenarios"]) assert.equal(safeLoginReturnTo("dashboard", path), "/");
});

test("published scenarios launch the selected revision through the staff API", async () => {
  const scenarioId = randomUUID(), sessionId = randomUUID();
  const launches: {accountId: string; id: string; revision: number; learnerId?: string}[] = [];
  const api = createTrainingApi({launchScenario: async (actor, id, revision, learnerId) => {
    launches.push({accountId: actor.accountId, id, revision, ...(learnerId ? {learnerId} : {})});
    return {sessionId};
  }} as TrainingOperations, async (_request, staff) => {
    assert.equal(staff, true);
    return {accountId: "10001", staff};
  });
  const request = (revision: number, learnerId?: string) => new Request(`https://atcmh.test/api/simulator/training/scenarios/${scenarioId}`, {
    method: "POST", body: JSON.stringify({action: "launch", revision, learnerId}),
  });
  assert.equal((await api(request(0), "scenarios", scenarioId)).status, 400);
  assert.equal(launches.length, 0);
  const response = await api(request(2), "scenarios", scenarioId);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {sessionId});
  assert.deepEqual(launches, [{accountId: "10001", id: scenarioId, revision: 2}]);
  assert.equal((await api(request(2, "invalid"), "scenarios", scenarioId)).status, 400);
  assert.equal(launches.length, 1);
  assert.equal((await api(request(2, "10002"), "scenarios", scenarioId)).status, 200);
  assert.deepEqual(launches[1], {accountId: "10001", id: scenarioId, revision: 2, learnerId: "10002"});
});
