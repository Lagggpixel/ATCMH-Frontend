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
  const collision = await api.sessionOperation(request("POST", {role: "staff", token: randomUUID()}), session.id, "join"); assert.equal(collision.status, 409); assert.equal((await collision.json()).code, "seat-open-elsewhere");
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

test("demonstrating locks the learner's controls and ends when the instructor leaves", async () => {
  let now = 1_000_000;
  const store = new MemoryStore(), service = new SessionService(store, () => now);
  const instructor: Actor = {accountId: "instructor", staff: true, displayName: "Alex Chen"};
  const session = await service.create(instructor, "Demonstration"), staffSeat = randomUUID(), learnerSeat = randomUUID();
  const learner: Actor = {accountId: "learner", staff: false, learnerSession: session.id};
  await service.join(instructor, session.id, "staff", staffSeat);
  const envelope = (action: import("./model").Action) => ({id: randomUUID(), time: now, action});
  await assert.rejects(service.dispatch(instructor, session.id, "staff", staffSeat, envelope({kind: "demonstrate", enabled: true})), {code: /^no-(trainee|mentee)$/});
  await service.join(learner, session.id, "mentee", learnerSeat);
  await assert.rejects(service.dispatch(learner, session.id, "mentee", learnerSeat, envelope({kind: "demonstrate", enabled: true})), {code: "forbidden"});
  await service.dispatch(instructor, session.id, "staff", staffSeat, envelope({kind: "demonstrate", enabled: true}));
  assert.equal(store.records.get(session.id)?.exercise.demonstration?.by, "Alex Chen");
  const aircraft = store.records.get(session.id)!.exercise.aircraft[0];
  await assert.rejects(service.dispatch(learner, session.id, "mentee", learnerSeat, envelope({kind: "edit", aircraftId: aircraft.id, patch: {tagAngle: 90}})), {code: "demonstrating"});
  now += 1_000;
  await service.leave(instructor, session.id, "staff", staffSeat);
  assert.equal(store.records.get(session.id)?.exercise.demonstration, undefined);
  await service.dispatch(learner, session.id, "mentee", learnerSeat, envelope({kind: "edit", aircraftId: aircraft.id, patch: {tagAngle: 90}}));
});

test("the operation route accepts every operation the session transport posts", async () => {
  const {readFile} = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/simulator/sessions/[id]/[operation]/route.ts", import.meta.url), "utf8");
  const transport = await readFile(new URL("./shared-transport.ts", import.meta.url), "utf8");
  const posted = [...transport.matchAll(/post\("([a-z-]+)"/g)].map(match => match[1]);
  assert.ok(posted.includes("demo"));
  for (const operation of posted) assert.match(route, new RegExp(`"${operation}"`), `${operation} is routed`);
});

test("a spectating Superadmin can demonstrate; the instructor can take it back and it lapses with the spectator's stream", async () => {
  let now = 2_000_000;
  const store = new MemoryStore(), service = new SessionService(store, () => now);
  const instructor = {accountId: "instructor", staff: true, displayName: "Alex Chen"}, spectator = {accountId: "spectator", staff: true, displayName: "Jordan Lee", superAdmin: true};
  const session = await service.create(instructor, "Spectated"), staffSeat = randomUUID(), learnerSeat = randomUUID(), watchSeat = randomUUID();
  const learner = {accountId: "learner", staff: false};
  await service.join(instructor, session.id, "staff", staffSeat);
  await service.join(learner, session.id, "mentee", learnerSeat);
  await assert.rejects(service.frame({accountId: "outsider", staff: true}, session.id, "spectator", watchSeat), {code: "forbidden"});
  const envelope = (action: import("./model").Action) => ({id: randomUUID(), time: now, action});
  const demo = () => store.records.get(session.id)?.exercise.demonstration;
  // One demonstrator at a time: a spectator cannot take over or end the instructor's demonstration.
  await service.dispatch(instructor, session.id, "staff", staffSeat, envelope({kind: "demonstrate", enabled: true}));
  await assert.rejects(service.dispatch(spectator, session.id, "spectator", watchSeat, envelope({kind: "demonstrate", enabled: true})), {code: "demonstrating"});
  await assert.rejects(service.dispatch(spectator, session.id, "spectator", watchSeat, envelope({kind: "demonstrate", enabled: false})), {code: "demonstrating"});
  await service.dispatch(instructor, session.id, "staff", staffSeat, envelope({kind: "demonstrate", enabled: false}));
  await service.dispatch(spectator, session.id, "spectator", watchSeat, envelope({kind: "demonstrate", enabled: true}));
  assert.equal(demo()?.spectator, true); assert.equal(demo()?.by, "Jordan Lee"); assert.equal(demo()?.byId, "spectator");
  const watched = await service.frame(learner, session.id, "mentee", learnerSeat);
  assert.equal(watched.exercise.demonstration?.by, "Jordan Lee"); assert.equal(watched.exercise.demonstration?.byId, undefined, "the learner never sees the spectator's account");
  const aircraft = store.records.get(session.id)!.exercise.aircraft[0];
  await assert.rejects(service.dispatch(learner, session.id, "mentee", learnerSeat, envelope({kind: "edit", aircraftId: aircraft.id, patch: {tagAngle: 90}})), {code: "demonstrating"});
  await assert.rejects(service.dispatch(instructor, session.id, "staff", staffSeat, envelope({kind: "demonstrate", enabled: true})), {code: "demonstrating"});
  // The instructor leaving does not end a spectator's demonstration; the instructor taking it back does.
  await service.leave(instructor, session.id, "staff", staffSeat);
  assert.equal(demo()?.spectator, true);
  await service.join(instructor, session.id, "staff", staffSeat);
  await service.dispatch(instructor, session.id, "staff", staffSeat, envelope({kind: "demonstrate", enabled: false}));
  assert.equal(demo(), undefined);
  // The spectator's stream keeps the seat; once it stops, the next tick hands control back.
  await service.dispatch(spectator, session.id, "spectator", watchSeat, envelope({kind: "demonstrate", enabled: true}));
  now += 10_000; await service.frame(spectator, session.id, "spectator", watchSeat);
  await service.frame(instructor, session.id, "staff", staffSeat); await service.frame(learner, session.id, "mentee", learnerSeat);
  now += 10_000; await service.frame(instructor, session.id, "staff", staffSeat); await service.frame(learner, session.id, "mentee", learnerSeat);
  assert.equal(demo()?.spectator, true, "renewed by the spectator's stream");
  now += 14_000; await service.frame(instructor, session.id, "staff", staffSeat); await service.frame(learner, session.id, "mentee", learnerSeat);
  assert.equal(demo(), undefined, "lapsed without the spectator's stream");
  // Leaving the spectator page hands back at once.
  await service.dispatch(spectator, session.id, "spectator", watchSeat, envelope({kind: "demonstrate", enabled: true}));
  await service.leave(spectator, session.id, "spectator", watchSeat);
  assert.equal(demo(), undefined);
});
