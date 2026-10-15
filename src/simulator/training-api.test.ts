import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createTrainingApi, type TrainingOperations} from "./server/training-api";
import {SessionError} from "./sessions";
import {safeLoginReturnTo} from "../platform/auth/login-routing";

test("training APIs authenticate reads, require staff for mutations and validate payloads", async () => {
  const calls: {method: string; staff: boolean}[] = [];
  const api = createTrainingApi({scenarios: async () => []} as unknown as TrainingOperations, async (request, staff) => {
    calls.push({method: request.method, staff});
    if (!request.headers.has("cookie")) throw new SessionError("unauthorized", "Sign in", 401);
    if (staff && request.headers.get("cookie") !== "staff") throw new SessionError("forbidden", "Moderator access required", 403);
    return {accountId: "10001", staff};
  });
  const req = (path: string, method = "GET", cookie = "student", body?: object) => new Request(`https://atcmh.test/api/simulator/training/${path}`, {method, headers: {cookie, "content-type": "application/json"}, ...(body ? {body: JSON.stringify(body)} : {})});
  assert.equal((await api(req("scenarios", "GET", "staff"), "scenarios")).status, 200); assert.equal(calls.at(-1)!.staff, true);
  assert.equal((await api(new Request("https://atcmh.test"), "scenarios")).status, 401);
  assert.equal((await api(req("scenarios"), "scenarios")).status, 403);
  for (const method of ["GET", "POST"]) for (const id of [undefined, randomUUID()]) {
    assert.equal((await api(req("assignments", method, "staff", method === "POST" ? {} : undefined), "assignments", id)).status, 404);
  }
  assert.equal((await api(req("scenarios", "POST", "staff", {draft: {}}), "scenarios")).status, 400);
  assert.equal((await api(req("attempts", "POST", "staff", {action: "finish", feedback: ""}), "attempts", randomUUID())).status, 400);
});
test("simulator authoring routes survive sign-in while removed assignment routes are rejected", () => {
  for (const path of ["/simulator/scenarios", "/simulator/scenarios/new", `/simulator/scenarios/${randomUUID()}`]) assert.equal(safeLoginReturnTo("dashboard", path), path);
  for (const path of ["/simulator/assignments", "/simulator/mentee/assignments", "/simulator/scenarios/not-a-uuid", "/simulator/scenarios/new/extra", "/simulator/assignments/secret", "//evil.test/simulator/scenarios"]) assert.equal(safeLoginReturnTo("dashboard", path), "/");
});

test("published scenarios launch the selected revision through the staff API", async () => {
  const scenarioId = randomUUID(), sessionId = randomUUID();
  const launches: {accountId: string; id: string; revision: number}[] = [];
  const api = createTrainingApi({launchScenario: async (actor, id, revision) => {
    launches.push({accountId: actor.accountId, id, revision});
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
  assert.equal((await api(request(2, "10002"), "scenarios", scenarioId)).status, 400);
  assert.equal(launches.length, 1);
});
