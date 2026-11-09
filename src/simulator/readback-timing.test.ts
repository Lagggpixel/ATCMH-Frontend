import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {AIRPORT, advance, applyEnvelope, autoReadbacks, initialExercise, restoreExercise, newAircraft, patternTargets} from "./engine";
import {DEFAULT_READBACK_DELAY, readbackDelaySeconds, type Action, type Exercise} from "./model";
import {envelopeSchema, exerciseSchema, menteeActionAllowed} from "./protocol";
import {standPlacement} from "./scenarios";
import {rewoundExercise, SessionService} from "./server/session-service";
import {MemoryStore} from "./session-test-store";
import {applyReplayDelta, replayDelta, replayState} from "./replays";
import {decodeValue, encodeValue} from "./sweatbox-codec";

function send(state: Exercise, action: Action) {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
}
function fixture() {
  const state = initialExercise(); state.running = true;
  Object.assign(state.aircraft[1], standPlacement(AIRPORT.features.find(f => f.kind === "parking_position")!.id));
  return state;
}
const command = (state: Exercise, instruction: Extract<Action, {kind: "command"}>["command"] = {type: "stop"}) => send(state, {kind: "command", aircraftId: state.aircraft[1].id, frequency: "ground", command: instruction, text: "Instruction"});
const tick = (state: Exercise, seconds: number) => autoReadbacks(advance(state, seconds), 3000, randomUUID);

test("default deadlines sample 2–2.5 real seconds once per command, including legacy sessions", () => {
  const samples = new Set<number>();
  for (let i = 0; i < 100; i++) {
    const state = command(fixture()), deadline = state.messages[0].autoReadbackAt!;
    assert.ok(deadline >= 2 && deadline <= 2.5); samples.add(deadline);
    const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    assert.equal(restored.messages[0].autoReadbackAt, deadline);
    assert.equal(advance(state, .1).messages[0].autoReadbackAt, deadline);
  }
  assert.ok(samples.size > 90);
  const id = randomUUID(); assert.equal(readbackDelaySeconds(DEFAULT_READBACK_DELAY, id), readbackDelaySeconds(DEFAULT_READBACK_DELAY, id));
});

test("slider limits accept every tenth from 0 to 10, reject invalid ranges, and remain staff-only", () => {
  for (let i = 0; i <= 100; i++) {
    const action = {kind: "readback-delay", delay: {min: i / 10, max: 10}} as const;
    assert.ok(envelopeSchema.safeParse({id: "range", time: 0, action}).success, `${i / 10}`);
    assert.equal(menteeActionAllowed(action), false);
  }
  for (const delay of [{min: -0.1, max: 2}, {min: 2, max: 10.1}, {min: 3, max: 2}, {min: .15, max: 2}, {min: NaN, max: 2}, {min: 0, max: Infinity}]) {
    const action = {kind: "readback-delay", delay} as const;
    assert.equal(envelopeSchema.safeParse({id: "range", time: 0, action}).success, false);
    assert.ok(applyEnvelope(fixture(), {id: "invalid", time: 0, action}).error);
  }
});

test("fixed and zero delays execute at readback, and editing a range leaves existing deadlines intact", () => {
  let state = send(fixture(), {kind: "readback-delay", delay: {min: 3.1, max: 3.1}});
  state = command(state); const deadline = state.messages[0].autoReadbackAt;
  assert.equal(deadline, 3.1);
  state = send(state, {kind: "readback-delay", delay: {min: 0, max: 0}});
  assert.equal(state.messages[0].autoReadbackAt, deadline);
  state = tick(state, 3); assert.equal(state.aircraft[1].holding, false); assert.equal(state.messages.length, 1);
  state = tick(state, .1); assert.equal(state.aircraft[1].holding, true); assert.equal(state.messages.length, 2);
  state = command(state, {type: "pushback", tail: "north"});
  assert.equal(state.messages.at(-1)!.autoReadbackAt, state.elapsed);
  state = tick(state, 0); assert.equal(state.aircraft[1].mode, "pushback"); assert.equal(state.messages.at(-1)!.sender, "pilot");
  assert.deepEqual(send(state, {kind: "reset"}).readbackDelay, {min: 0, max: 0});
});

test("replaced unread commands never execute or regain a timer after reconnect or automation toggles", () => {
  let state = send(fixture(), {kind: "readback-delay", delay: {min: 2, max: 2}});
  state = command(state); const old = state.messages[0].id;
  state = tick(state, 1.9); state = command(state, {type: "pushback", tail: "north"});
  const latest = state.messages.at(-1)!.id;
  assert.equal(state.messages[0].autoReadbackAt, undefined);
  state = tick(state, .2); assert.equal(state.aircraft[1].holding, false); assert.equal(state.messages.length, 2);
  const rejected = applyEnvelope(state, {id: randomUUID(), time: 1000, action: {kind: "pilot", aircraftId: state.aircraft[1].id, replyTo: old, assign: true, text: "Old readback"}});
  assert.match(rejected.error!, /superseded/);
  state = restoreExercise(exerciseSchema.parse(state));
  state = send(send(state, {kind: "auto-readback", enabled: false}), {kind: "auto-readback", enabled: true});
  state = tick(state, 2); assert.equal(state.aircraft[1].mode, "pushback");
  assert.equal(state.messages.at(-1)!.commandId, latest);
  state = tick(state, 10); assert.equal(state.aircraft[1].holding, false);
  assert.equal(state.messages.filter(m => m.commandId === old).length, 0);
});

test("ranges and deadlines survive replay and rewind; speed changes preserve the real wait and pause freezes it", () => {
  let state = send(fixture(), {kind: "readback-delay", delay: {min: 2.4, max: 2.4}});
  const before = replayState(state); state = command(state);
  const replayed = applyReplayDelta(before, replayDelta(before, replayState(state)));
  assert.deepEqual(replayed.readbackDelay, {min: 2.4, max: 2.4});
  assert.equal(replayed.messages[0].autoReadbackAt, 2.4);
  state = tick(state, 1); state = send(state, {kind: "time-scale", scale: 4});
  assert.equal(state.messages[0].autoReadbackAt, 6.6);
  state = send(state, {kind: "pause"}); assert.equal(tick(state, 20).elapsed, 1);
  state = send(state, {kind: "play"}); state = tick(tick(state, 5), .5); assert.equal(state.messages.length, 1);
  state = tick(state, .1); assert.equal(state.messages.length, 2);
  const rewound = rewoundExercise(state, command(fixture()), "rewind-range");
  assert.deepEqual(rewound.readbackDelay, state.readbackDelay);
  assert.ok(Math.abs(rewound.messages[0].autoReadbackAt! - 9.6) < 1e-8);
});

test("a new transmission without readback permanently cancels the unread instruction", () => {
  let state = command(send(fixture(), {kind: "readback-delay", delay: {min: .1, max: 9.9}})); const old = state.messages[0].id;
  state = command(state, {type: "radio", message: "standby"});
  assert.equal(state.messages[0].supersededBy, state.messages[1].id);
  state = restoreExercise(exerciseSchema.parse(decodeValue(encodeValue(state))));
  assert.deepEqual(state.readbackDelay, {min: .1, max: 9.9});
  state = send(send(state, {kind: "auto-readback", enabled: false}), {kind: "auto-readback", enabled: true});
  assert.equal(state.messages[0].autoReadbackAt, undefined);
  const after = tick(state, 5);
  assert.equal(after.aircraft[1].holding, false);
  assert.equal(after.messages.filter(m => m.commandId === old).length, 0);
  const stale = applyEnvelope(after, {id: randomUUID(), time: 2000, action: {kind: "pilot", aircraftId: after.aircraft[1].id, replyTo: old, assign: true, text: "Late"}});
  assert.match(stale.error!, /superseded/);
});

test("unread sequence commands cannot change the aircraft's leader before readback or after replacement", () => {
  let state = fixture();
  state.aircraft = [newAircraft("follower", true), newAircraft("leader", true)];
  state.aircraft[1].position = patternTargets(state.aircraft[1]).base;
  state = send(state, {kind: "command", aircraftId: "follower", frequency: "tower", command: {type: "sequence", number: 2, traffic: "Final"}, text: "Number two"});
  assert.equal(state.aircraft[0].sequence, undefined);
  assert.equal(state.messages[0].readbackSequence?.followingId, "leader");
  const read = send(state, {kind: "pilot", aircraftId: "follower", replyTo: state.messages[0].id, assign: true, text: "Number two"});
  assert.equal(read.aircraft[0].sequence?.followingId, "leader");
  state = send(state, {kind: "command", aircraftId: "follower", frequency: "tower", command: {type: "speed", value: 180}, text: "180 knots"});
  state = tick(state, 2.5); assert.equal(state.aircraft[0].sequence, undefined); assert.equal(state.aircraft[0].targetSpeed, 180);
});

test("the live service authorizes, broadcasts and restores session timing across reconnect", async () => {
  let now = 1000000; const store = new MemoryStore(), staff = {accountId: "1", staff: true};
  let service = new SessionService(store, () => now);
  const session = await service.create(staff, "Timing"), token = randomUUID();
  await service.join(staff, session.id, "staff", token);
  const action = {kind: "readback-delay", delay: {min: .1, max: 9.9}} as const;
  const trainee = {accountId: "2", staff: false, learnerSession: session.id}, traineeToken = randomUUID();
  await service.join(trainee, session.id, "mentee", traineeToken);
  await assert.rejects(service.dispatch(trainee, session.id, "mentee", traineeToken, {id: randomUUID(), time: now, action}), {code: "forbidden"});
  await service.dispatch(staff, session.id, "staff", token, {id: randomUUID(), time: now, action});
  service = new SessionService(store, () => now); now += 100;
  assert.deepEqual((await service.frame(staff, session.id, "staff", token)).exercise.readbackDelay, action.delay);
});
