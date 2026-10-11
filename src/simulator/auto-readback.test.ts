import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {advance, AIRPORT, applyEnvelope, autoReadbacks, initialExercise, restoreExercise} from "./engine";
import {standPlacement} from "./scenarios";
import {pendingCommands, type Action, type Exercise} from "./model";
import {envelopeSchema, exerciseSchema, menteeActionAllowed} from "./protocol";
import {MemoryStore} from "./session-test-store";
import {SessionService} from "./server/session-service";

const envelope = (action: Action) => ({id: randomUUID(), time: 1_000_000, action});
const send = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, envelope(action)); assert.equal(result.error, undefined); return result.state;
};
const tick = (state: Exercise, seconds: number) => autoReadbacks(advance(state, seconds), 1_002_000, randomUUID);
const command = (state: Exercise, aircraftId = "demo-ground", instruction: Extract<Action, {kind: "command"}>["command"] = {type: "stop"}) => send(state, {kind: "command", aircraftId, command: instruction, frequency: aircraftId === "demo-air" ? "tower" : "ground", text: `${state.aircraft.find(a => a.id === aircraftId)!.callsign}, hold position`});
const placeAtStand = (state: Exercise) => {Object.assign(state.aircraft[1], standPlacement(AIRPORT.features.find(f => f.kind === "parking_position")!.id)); return state;};
const enabled = () => send(send(placeAtStand(initialExercise()), {kind: "auto-readback", enabled: true}), {kind: "play"});

test("global automation waits 1.5 seconds and assigns each aircraft once with unread readbacks", () => {
  let state = command(command(enabled()), "demo-air", {type: "extend", leg: "downwind"});
  const original = state;
  state = tick(state, 1.4); assert.equal(state.messages.length, 2); assert.equal(state.aircraft[1].holding, false);
  state = tick(state, .1); assert.equal(state.messages.length, 4); assert.equal(state.aircraft[1].holding, true);
  assert.equal(state.aircraft[0].extended, true);
  assert.equal(state.messages[2].text, "hold position, Speedbird 124");
  for (const a of state.aircraft) {assert.equal(a.pending, 1); assert.equal(pendingCommands(state, a.id).length, 0);}
  assert.equal(tick(state, 2).messages.length, 4); assert.equal(original.messages.length, 2);
});

test("only latest command executes; manual readback or Unable consumes queued batch", () => {
  let state = command(enabled()); state = tick(state, 1);
  state = command(state, "demo-ground", {type: "pushback", tail: "north"});
  state = tick(state, .6); assert.equal(state.messages.length, 2); assert.equal(state.aircraft[1].holding, false);
  state = tick(state, .9); assert.equal(state.aircraft[1].mode, "pushback"); assert.equal(state.messages.length, 3);
  for (const text of ["Readback", "Unable"]) {
    let manual = command(enabled());
    manual = send(manual, {kind: "pilot", aircraftId: "demo-ground", replyTo: manual.messages[0].id, text});
    assert.equal(tick(manual, 2).messages.length, 2); assert.equal(tick(manual, 2).aircraft[1].holding, false);
  }
});

test("off cancels timers, on schedules pending traffic, pauses freeze and snapshots preserve deadlines", () => {
  let state = command(enabled()); state = tick(state, 1);
  state = send(state, {kind: "auto-readback", enabled: false}); state = tick(state, 2);
  assert.equal(state.messages.length, 1); assert.equal(state.messages[0].autoReadbackAt, undefined);
  state = send(state, {kind: "auto-readback", enabled: true}); state = tick(state, 1);
  state = send(state, {kind: "pause"}); state = tick(state, 3); assert.equal(state.messages.length, 1);
  state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  assert.equal(state.autoReadback, true);
  state = send(state, {kind: "play"}); state = tick(state, .5); assert.equal(state.messages.length, 2);
  assert.equal(send(state, {kind: "reset"}).autoReadback, true);
  const legacy = initialExercise(); delete legacy.autoReadback; assert.equal(exerciseSchema.safeParse(legacy).success, true);
});

test("assignments revalidate: invalid instructions return Unable, retunes never execute stale commands", () => {
  let state = command(enabled(), "demo-air", {type: "takeoff", runway: "24"}); state = tick(state, 1.5);
  assert.match(state.messages.at(-1)!.text, /^Unable, This instruction requires ground traffic/);
  assert.equal(state.aircraft[0].mode, "pattern"); assert.equal(tick(state, 2).messages.length, 2);
  state = command(enabled()); state = send(state, {kind: "edit", aircraftId: "demo-ground", patch: {frequency: "tower"}});
  state = tick(state, 1.5); assert.equal(state.messages.length, 1);
  state = send(state, {kind: "edit", aircraftId: "demo-ground", patch: {frequency: "ground"}});
  assert.equal(tick(state, 2).messages.length, 1);
});

test("frequency transfer replies on original channel and movement prediction never generates replies", () => {
  const state = command(enabled(), "demo-ground", {type: "frequency", frequency: "tower"});
  assert.equal(advance(state, 2).messages.length, 1);
  const replied = tick(state, 1.5); assert.equal(replied.aircraft[1].frequency, "tower");
  assert.equal(replied.messages.at(-1)!.frequency, "ground"); assert.equal(tick(replied, 2).messages.length, 2);
});

test("shared sessions authorize staff toggle, persist across server reconnect and broadcast reply content", async () => {
  let time = 1_000_000;
  const store = new MemoryStore(), staff = {accountId: "1", staff: true}, mentee = {accountId: "2", staff: false};
  let service = new SessionService(store, () => time);
  const session = await service.create(staff, "Auto"), control = randomUUID(), student = randomUUID();
  placeAtStand(store.records.get(session.id)!.exercise);
  await service.join(staff, session.id, "staff", control); await service.join(mentee, session.id, "mentee", student);
  const toggle = envelope({kind: "auto-readback", enabled: true});
  assert.equal(envelopeSchema.safeParse(toggle).success, true); assert.equal(menteeActionAllowed(toggle.action), false);
  await assert.rejects(service.dispatch(mentee, session.id, "mentee", student, toggle), {code: "forbidden"});
  for (const e of [toggle, envelope({kind: "play"})]) await service.dispatch(staff, session.id, "staff", control, e);
  await service.dispatch(mentee, session.id, "mentee", student, envelope({kind: "command", aircraftId: "demo-ground", command: {type: "pushback", tail: "north"}, frequency: "ground", text: "Easy 571, pushback approved, tail to the north"}));
  const before = await service.frame(staff, session.id, "staff", control);
  time += 1000; await service.frame(mentee, session.id, "mentee", student);
  service = new SessionService(store, () => time);
  time += 600;
  const after = await service.frame(mentee, session.id, "mentee", student);
  assert.equal(after.exercise.messages.length, 2); assert.equal(after.exercise.aircraft[1].mode, "pushback");
  assert.ok(after.contentRevision > before.contentRevision);
  const staffView = await service.frame(staff, session.id, "staff", control);
  assert.deepEqual(staffView.exercise, after.exercise);
  time += 200;
  const moving = await service.frame(mentee, session.id, "mentee", student);
  assert.notDeepEqual(moving.exercise.aircraft[1].position, after.exercise.aircraft[1].position);
  assert.equal(moving.exercise.messages.length, 2);
  const other = await service.create(staff, "Independent");
  assert.equal(store.records.get(other.id)!.exercise.autoReadback, true);
});
