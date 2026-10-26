import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {initialExercise} from "./engine";
import {SessionError, SESSION_LEASE_MS} from "./sessions";
import {SessionService, type Actor} from "./server/session-service";
import type {Action} from "./model";
import {MemoryStore} from "./session-test-store";


const staff: Actor = {accountId: "101", staff: true, displayName: "Mentor One"}, other: Actor = {accountId: "102", staff: true, displayName: "Mentor Two"}, mentee: Actor = {accountId: "103", staff: false};
function setup() {const store = new MemoryStore(); let time = 1_000_000; return {store, service: new SessionService(store, () => time), move: (ms: number) => {time += ms;}};}
const send = (action: Action, id = randomUUID()) => ({id, time: 0, action});
const code = (expected: string) => (error: unknown) => error instanceof SessionError && error.code === expected;

test("session lists expose both active participant names and IDs, never lease tokens or stale identities", async () => {
  const {service, move} = setup(), s = await service.create(staff, "Participants"), token = randomUUID();
  await service.join(staff, s.id, "staff", token);
  await service.join({...mentee, displayName: "Mentee One"}, s.id, "mentee", randomUUID());
  const row = (await service.list(other))[0];
  assert.equal(row.staffName, "Mentor One"); assert.equal(row.menteeName, "Mentee One"); assert.equal(row.menteeId, mentee.accountId);
  assert.ok(!JSON.stringify(row).includes(token));
  move(SESSION_LEASE_MS + 1);
  const expired = (await service.list(other))[0];
  assert.equal(expired.staffId, undefined); assert.equal(expired.menteeId, undefined); assert.equal(expired.menteeName, undefined);
});

test("different staff and multiple sessions stay isolated, including commands and clocks in the shared library", async () => {
  const {service, move} = setup(); const a = await service.create(staff, "Ground"), b = await service.create(other, "Tower"), c = await service.create(staff, "Circuits");
  const ta = randomUUID(), tb = randomUUID(); await service.join(staff, a.id, "staff", ta); await service.join(other, b.id, "staff", tb);
  await service.dispatch(staff, a.id, "staff", ta, send({kind: "play"})); move(1000);
  assert.ok((await service.frame(staff, a.id, "staff", ta)).exercise.elapsed > .99);
  assert.equal((await service.frame(other, b.id, "staff", tb)).exercise.elapsed, 0);
  assert.deepEqual((await service.list(staff)).map(s => s.id).sort(), [a.id, b.id, c.id].sort());
  assert.deepEqual((await service.list(other)).map(s => s.id).sort(), [a.id, b.id, c.id].sort());
  await assert.rejects(service.join(other, a.id, "staff", randomUUID()), code("seat-occupied"));
  await assert.rejects(service.join(mentee, a.id, "staff", randomUUID()), code("forbidden"));
});
test("one control and one mentee seat, even when simultaneous claims race", async () => {
  const {service} = setup(); const s = await service.create(staff, "Seats");
  for (const [actor, role] of [[staff, "staff"], [mentee, "mentee"]] as const) {
    const results = await Promise.allSettled([service.join(actor, s.id, role, randomUUID()), service.join(actor, s.id, role, randomUUID())]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    // The same account on a second page is told its seat is open elsewhere, and can move it.
    assert.equal(rejected.reason.code, "seat-open-elsewhere");
  }
  assert.equal((await service.list(staff))[0].staffOccupied, true);
  assert.equal((await service.list(staff))[0].menteeOccupied, true);
});
test("closing all pages, lease expiry, and server restart preserve the scenario until explicit end", async () => {
  const {service, store, move} = setup(), s = await service.create(staff, "Resume"), token = randomUUID();
  await service.join(staff, s.id, "staff", token); await service.dispatch(staff, s.id, "staff", token, send({kind: "play"})); move(1000);
  const before = await service.frame(staff, s.id, "staff", token); await service.leave(staff, s.id, "staff", token); move(86_400_000);
  const restarted = new SessionService(store, () => 87_401_000), newToken = randomUUID();
  const after = await restarted.join(staff, s.id, "staff", newToken);
  assert.deepEqual(after.exercise, before.exercise); assert.equal(after.exercise.running, true);
  await restarted.end(staff, s.id); assert.equal((await restarted.list(staff)).length, 0);
  await assert.rejects(restarted.frame(staff, s.id, "staff", newToken), code("not-found"));
  await assert.rejects(restarted.join(mentee, s.id, "mentee", randomUUID()), code("not-found"));
});
test("expired seats can be reclaimed; the old page cannot command or release the new seat", async () => {
  const {service, move} = setup(), s = await service.create(staff, "Recovery"), old = randomUUID(), fresh = randomUUID();
  await service.join(staff, s.id, "staff", old); move(SESSION_LEASE_MS + 1);
  await service.join(other, s.id, "staff", fresh);
  await assert.rejects(service.dispatch(staff, s.id, "staff", old, send({kind: "reset"})), code("seat-lost"));
  await service.leave(staff, s.id, "staff", old);
  const frame = await service.frame(other, s.id, "staff", fresh);
  assert.equal(frame.session.staffOccupied, true);
  assert.equal(frame.session.ownerName, "Mentor One");
  assert.equal(frame.session.staffName, "Mentor Two");
  assert.equal(frame.session.ownerId, staff.accountId);
});
test("mentee requests/read state and controller commands are shared, ordered and deduplicated", async () => {
  const {service} = setup(), s = await service.create(staff, "Radio"), control = randomUUID(), student = randomUUID();
  const first = await service.join(staff, s.id, "staff", control); await service.join(mentee, s.id, "mentee", student);
  const aircraftId = first.exercise.aircraft[1].id;
  await assert.rejects(service.dispatch(mentee, s.id, "mentee", student, send({kind: "reset"})), code("forbidden"));
  const request = send({kind: "pilot", aircraftId, text: "Request taxi"});
  await service.dispatch(staff, s.id, "staff", control, request); await service.dispatch(staff, s.id, "staff", control, request);
  let frame = await service.frame(mentee, s.id, "mentee", student); assert.equal(frame.exercise.messages.length, 1); assert.equal(frame.exercise.aircraft[1].pending, 1);
  await service.dispatch(mentee, s.id, "mentee", student, send({kind: "read", aircraftId, frequency: "ground"}));
  frame = await service.frame(staff, s.id, "staff", control); assert.equal(frame.exercise.aircraft[1].pending, 0);
  await service.dispatch(mentee, s.id, "mentee", student, send({kind: "command", aircraftId, command: {type: "stop"}, frequency: "ground", text: "Hold position"}));
  frame = await service.frame(staff, s.id, "staff", control); assert.equal(frame.exercise.messages.at(-1)?.sender, "controller");
});
test("staff leaving does not pause an occupied mentee scenario, explicit Pause still hides it", async () => {
  const {service, move} = setup(), s = await service.create(staff, "No disconnect pause"), control = randomUUID(), student = randomUUID();
  await service.join(staff, s.id, "staff", control); await service.join(mentee, s.id, "mentee", student);
  await service.dispatch(staff, s.id, "staff", control, send({kind: "play"})); await service.leave(staff, s.id, "staff", control); move(1000);
  let frame = await service.frame(mentee, s.id, "mentee", student); assert.ok(frame.exercise.elapsed > .99); assert.equal(frame.exercise.pausedByStaff, false);
  await service.join(staff, s.id, "staff", control); await service.dispatch(staff, s.id, "staff", control, send({kind: "pause"}));
  frame = await service.frame(mentee, s.id, "mentee", student); assert.equal(frame.exercise.pausedByStaff, true);
});
test("an imported browser exercise gets an independent identifier and survives reconnect", async () => {
  const {service} = setup(), imported = initialExercise(); imported.aircraft[0].callsign = "Preserved traffic";
  const s = await service.create(staff, "Imported", imported), token = randomUUID();
  const frame = await service.join(staff, s.id, "staff", token);
  assert.equal(frame.exercise.id, s.id); assert.notEqual(s.id, imported.id); assert.equal(frame.exercise.aircraft[0].callsign, "Preserved traffic");
  await assert.rejects(service.end(other, s.id), code("seat-occupied"));
  await service.leave(staff, s.id, "staff", token);
  await service.end(other, s.id);
  assert.equal((await service.list(staff)).length, 0);
});
