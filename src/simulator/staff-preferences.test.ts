import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {initialExercise} from "./engine";
import {SessionService} from "./server/session-service";
import {MemoryStore} from "./session-test-store";
import type {Action} from "./model";

const staff = {accountId: "101", staff: true}, other = {accountId: "102", staff: true};
const envelope = (action: Action) => ({id: randomUUID(), time: 0, action});

test("new sessions default on after ending prior sessions and across staff accounts", async () => {
  const store = new MemoryStore(); let service = new SessionService(store);
  const a = await service.create(staff, "First"), control = randomUUID();
  const initial = await service.join(staff, a.id, "staff", control); assert.equal(initial.exercise.autoReadback, true);
  await service.dispatch(staff, a.id, "staff", control, envelope({kind: "auto-readback", enabled: true}));
  await service.end(staff, a.id); assert.equal(store.records.size, 0);
  service = new SessionService(store);
  const b = await service.create(staff, "After reconnect"), c = await service.create(other, "Other staff");
  assert.equal(store.records.get(b.id)!.exercise.autoReadback, true);
  assert.equal(store.records.get(c.id)!.exercise.autoReadback, true);
  assert.equal(store.preferences.size, 0);
});

test("disabling is session-specific; other and new sessions remain automatic; duplicate toggles cannot reenable", async () => {
  const store = new MemoryStore(), service = new SessionService(store);
  const a = await service.create(staff, "One"), control = randomUUID(); await service.join(staff, a.id, "staff", control);
  const enable = envelope({kind: "auto-readback", enabled: true}); await service.dispatch(staff, a.id, "staff", control, enable);
  const b = await service.create(staff, "Two"); assert.equal(store.records.get(b.id)!.exercise.autoReadback, true);
  await service.dispatch(staff, a.id, "staff", control, envelope({kind: "auto-readback", enabled: false}));
  await service.dispatch(staff, a.id, "staff", control, enable);
  assert.equal(store.records.get(a.id)!.exercise.autoReadback, false);
  assert.equal(store.records.get(b.id)!.exercise.autoReadback, true);
  const c = await service.create(staff, "Three"); assert.equal(store.records.get(c.id)!.exercise.autoReadback, true);
  // Continuing an existing exercise retains its own setting.
  const resumed = await service.join(staff, b.id, "staff", randomUUID()); assert.equal(resumed.exercise.autoReadback, true);
});

test("reset retains the explicit session setting and clears messages/timers", async () => {
  const store = new MemoryStore(), service = new SessionService(store);
  const a = await service.create(staff, "Reset"), control = randomUUID(); await service.join(staff, a.id, "staff", control);
  await service.dispatch(staff, a.id, "staff", control, envelope({kind: "auto-readback", enabled: false}));
  await service.dispatch(staff, a.id, "staff", control, envelope({kind: "command", aircraftId: "demo-ground", command: {type: "stop"}, frequency: "ground", text: "Hold position"}));
  await service.dispatch(staff, a.id, "staff", control, envelope({kind: "reset"}));
  const frame = await service.frame(staff, a.id, "staff", control);
  assert.equal(frame.exercise.autoReadback, false); assert.equal(frame.exercise.messages.length, 0);
  assert.equal(store.preferences.size, 0);
});

test("new imported exercises ignore saved defaults and only the active staff seat can disable Automatic", async () => {
  const store = new MemoryStore(), service = new SessionService(store);
  await store.saveAutoReadback(staff.accountId, false);
  const a = await service.create(staff, "Imported", {...initialExercise(), autoReadback: false}), control = randomUUID(), student = randomUUID();
  await service.join(staff, a.id, "staff", control); await service.join({accountId: "103", staff: false}, a.id, "mentee", student);
  assert.equal(store.records.get(a.id)!.exercise.autoReadback, true);
  const toggle = envelope({kind: "auto-readback", enabled: false});
  await assert.rejects(service.dispatch({accountId: "103", staff: false}, a.id, "mentee", student, toggle), {code: "forbidden"});
  await assert.rejects(service.dispatch(other, a.id, "staff", control, toggle), {code: "seat-lost"});
  await assert.rejects(service.dispatch(staff, a.id, "staff", randomUUID(), toggle), {code: "seat-lost"});
  assert.equal(store.records.get(a.id)!.exercise.autoReadback, true); assert.equal(store.preferences.get(staff.accountId), false);
});
