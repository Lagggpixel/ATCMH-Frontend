import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createSessionApi} from "./server/session-api";
import {MemoryStore} from "./session-test-store";
import {SessionError} from "./sessions";
import {SessionService} from "./server/session-service";

test("HTTP session contract streams shared commands, rejects duplicate seats and closes ended sessions", async () => {
  const store = new MemoryStore();
  const api = createSessionApi(store, async (r, staff) => {
    if (!r.headers.get("cookie")) throw new SessionError("unauthorized", "Sign in", 401);
    return {accountId: r.headers.get("cookie")!, staff};
  });
  const request = (method: string, body?: unknown, headers: Record<string, string> = {}) => new Request("https://atcmh.test/api/simulator/sessions", {method, headers: {cookie: "101", "content-type": "application/json", ...headers}, ...(body ? {body: JSON.stringify(body)} : {})});
  assert.equal((await api.sessionCollection(new Request("https://atcmh.test"))).status, 401);
  const rejected = await api.sessionCollection(request("POST", {title: "Blank exercise"}));
  assert.equal(rejected.status, 409); assert.equal((await rejected.json()).code, "scenario-required");
  assert.equal((await store.list(Date.now())).length, 0);
  const session = await new SessionService(store).create({accountId: "101", staff: true}, "Contract exercise"), control = randomUUID(), student = randomUUID();
  assert.equal((await api.sessionOperation(request("POST", {role: "staff", token: control}), session.id, "join")).status, 200);
  const collision = await api.sessionOperation(request("POST", {role: "staff", token: randomUUID()}), session.id, "join"); assert.equal(collision.status, 409); assert.equal((await collision.json()).code, "seat-occupied");
  assert.equal((await api.sessionOperation(request("POST", {role: "mentee", token: student}, {cookie: "103"}), session.id, "join")).status, 200);
  const stream = await api.sessionOperation(request("GET", undefined, {cookie: "103", "x-simulator-role": "mentee", "x-simulator-seat": student}), session.id, "stream");
  assert.match(stream.headers.get("content-type")!, /text\/event-stream/);
  const reader = stream.body!.getReader();
  const packet = async () => {const {value} = await reader.read(); return JSON.parse(new TextDecoder().decode(value).slice(6).trim());};
  try {
    const first = await packet(); assert.equal(first.type, "snapshot"); assert.equal(first.exercise.id, session.id);
    const command = {role: "staff", token: control, envelope: {id: randomUUID(), time: 0, action: {kind: "pause"}}};
    assert.equal((await api.sessionOperation(request("POST", command), session.id, "commands")).status, 200);
    let paused = await packet(); while (paused.type === "presence") paused = await packet();
    assert.equal(paused.type, "snapshot"); assert.equal(paused.exercise.pausedByStaff, true);
    const denied = await api.sessionOperation(request("POST", {...command, role: "mentee", token: student}, {cookie: "103"}), session.id, "commands"); assert.equal(denied.status, 403);
    assert.equal((await api.sessionOperation(request("DELETE"), session.id, "end")).status, 200);
    let ended = await packet(); while (ended.type !== "failure") ended = await packet(); assert.equal(ended.code, "not-found");
    assert.equal((await api.sessionOperation(request("POST", {role: "mentee", token: student}, {cookie: "103"}), session.id, "join")).status, 404);
    assert.equal((await api.sessionOperation(request("POST", {role: "staff", token: control}), "bad-id", "join")).status, 400);
  } finally {await reader.cancel();}
});
