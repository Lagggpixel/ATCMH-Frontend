import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {SessionService} from "./server/session-service";
import {createSessionApi} from "./server/session-api";
import {MemoryStore} from "./session-test-store";
import {SessionError} from "./sessions";
import {safeLoginReturnTo} from "../platform/auth/login-routing";

test("retired code lookup does not resolve or return the session library", async () => {
  const store = new MemoryStore();
  const api = createSessionApi(store, async (request, staff) => {
    if (!request.headers.has("cookie")) throw new SessionError("unauthorized", "Sign in", 401);
    assert.equal(staff, true);
    return {accountId: "mentor", staff: true};
  });
  const url = "https://atcmh.test/api/simulator/sessions?code=EGPH-12345678";
  assert.equal((await api.sessionCollection(new Request(url))).status, 401);
  const response = await api.sessionCollection(new Request(url, {headers: {cookie: "signed-in"}}));
  assert.equal(response.status, 404);
  const data = await response.json();
  assert.equal(data.sessionId, undefined); assert.equal(data.sessions, undefined);
  assert.equal((await api.sessionCollection(new Request("https://atcmh.test/api/simulator/sessions", {headers: {cookie: "signed-in"}}))).status, 200);
});

test("direct mentee links retain seat access and login returns without the join form", async () => {
  const store = new MemoryStore(), service = new SessionService(store);
  const session = await service.create({accountId: "mentor", staff: true}, "Direct link session");
  const api = createSessionApi(store, async () => ({accountId: "learner", staff: false}));
  const response = await api.sessionOperation(new Request(`https://atcmh.test/api/simulator/sessions/${session.id}/join`, {method: "POST", body: JSON.stringify({role: "mentee", token: randomUUID()})}), session.id, "join");
  assert.equal(response.status, 200);
  assert.equal(store.records.get(session.id)?.mentee?.accountId, "learner");
  const path = `/simulator/mentee/${session.id}`;
  assert.equal(safeLoginReturnTo("dashboard", path), path);
  assert.equal(safeLoginReturnTo("dashboard", "/simulator/mentee"), "/");
});
