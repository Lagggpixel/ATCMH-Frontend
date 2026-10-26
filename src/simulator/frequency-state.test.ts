import assert from "node:assert/strict";
import test from "node:test";
import {applyEnvelope, initialExercise, restoreExercise, autoReadbacks, advance, engineFor} from "./engine";
import {aircraftTagVisible, frequencyPendingRequests, pendingPilotMessage, runwayWind, unreadMessages, type Action, type Exercise, type Aircraft, type Instruction} from "./model";
import {exerciseSchema} from "./protocol";
import {randomUUID} from "node:crypto";

let id = 0;

const act = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: `frequency-${++id}`, time: 1791540000000, action});
  assert.equal(result.error, undefined); return result.state;
};

test("frequency attention counts messages, clears when read and follows current strips", () => {
  let state = initialExercise();
  for (let i = 0; i < 5; i++) state = act(state, {kind: "pilot", aircraftId: "demo-ground", text: `Request ${i}`});
  state = act(state, {kind: "pilot", aircraftId: "demo-air", text: "Request pattern"});
  assert.deepEqual(frequencyPendingRequests(state), {ground: 5, tower: 1, atis: 0, approach: 0, center: 0, departure:0, unicom:0});
  state = act(state, {kind: "read", aircraftId: "demo-ground", frequency: "ground"});
  assert.deepEqual(frequencyPendingRequests(state), {ground: 0, tower: 1, atis: 0, approach: 0, center: 0, departure:0, unicom:0});
  assert.ok(pendingPilotMessage(state, "demo-ground", "ground"), "Opening a strip must preserve the reply context");
  state = act(state, {kind: "command", aircraftId: "demo-ground", frequency: "ground", text: "Hold position", command: {type: "stop"}});
  assert.deepEqual(frequencyPendingRequests(state), {ground: 0, tower: 1, atis: 0, approach: 0, center: 0, departure:0, unicom:0});
  state = act(state, {kind: "pilot", aircraftId: "demo-ground", text: "Changing channel"});
  state = act(state, {kind: "edit", aircraftId: "demo-ground", patch: {frequency: "tower"}});
  assert.deepEqual(frequencyPendingRequests(state), {ground: 0, tower: 1, atis: 0, approach: 0, center: 0, departure:0, unicom:0});
  state = act(state, {kind: "remove", aircraftId: "demo-air"});
  assert.deepEqual(frequencyPendingRequests(state), {ground: 0, tower: 0, atis: 0, approach: 0, center: 0, departure:0, unicom:0});
});

test("read requests stay read through Ground/Tower transfers in both directions", () => {
  for (const [from, to] of [["ground", "tower"], ["tower", "ground"]] as const) {
    let state = act(initialExercise(), {kind: "edit", aircraftId: "demo-ground", patch: {frequency: from}});
    state = act(state, {kind: "pilot", aircraftId: "demo-ground", text: "Request frequency change"});
    assert.equal(unreadMessages(state, "demo-ground", from), 1);
    state = act(state, {kind: "read", aircraftId: "demo-ground", frequency: from});
    state = act(state, {kind: "command", aircraftId: "demo-ground", frequency: from, text: "Contact other frequency", command: {type: "frequency", frequency: to}});
    const replyTo = state.messages.at(-1)!.id;
    state = act(state, {kind: "pilot", aircraftId: "demo-ground", text: "Changing frequency", replyTo, assign: true});
    assert.equal(state.aircraft[1].frequency, to);
    assert.equal(unreadMessages(state, "demo-ground", to), 0);
    assert.equal(unreadMessages(state, "demo-ground", from), 0); // Readbacks are logged without becoming requests.
    state = act(state, {kind: "pilot", aircraftId: "demo-ground", text: "With you"});
    assert.equal(unreadMessages(state, "demo-ground", to), 1);
    state = act(state, {kind: "read", aircraftId: "demo-ground", frequency: to});
    assert.equal(unreadMessages(state, "demo-ground", from), 0);
    assert.equal(unreadMessages(state, "demo-ground", to), 0);
    state = restoreExercise(exerciseSchema.parse(state));
    assert.equal(unreadMessages(state, "demo-ground", to), 0);
    assert.equal(state.messages[0].read, true);
  }
});

test("readbacks, assignments and Unable replies cannot create pending or unread requests, including old snapshots", () => {
  for (const reply of [{text: "Holding"}, {text: "Holding", assign: true}, {text: "Unable"}]) {
    let state = act(initialExercise(), {kind: "pilot", aircraftId: "demo-ground", text: "Request taxi"});
    state = act(state, {kind: "command", aircraftId: "demo-ground", frequency: "ground", text: "Hold position", command: {type: "stop"}});
    const commandId = state.messages.at(-1)!.id;
    state = act(state, {kind: "read", aircraftId: "demo-ground", frequency: "ground"});
    state = act(state, {kind: "pilot", aircraftId: "demo-ground", replyTo: commandId, ...reply});
    assert.equal(state.aircraft[1].pending, 0);
    assert.equal(state.messages.at(-1)!.read, true);
    assert.equal(pendingPilotMessage(state, "demo-ground", "ground"), undefined);
    assert.deepEqual(frequencyPendingRequests(state), {ground: 0, tower: 0, atis: 0, approach: 0, center: 0, departure:0, unicom:0});
    state.messages.at(-1)!.read = false; // Previous releases stored replies as unread.
    assert.equal(unreadMessages(state, "demo-ground"), 0);
    assert.equal(restoreExercise(state).aircraft[1].pending, 0);
  }
});

test("Standby clears attention while retaining the unanswered request's reply context", () => {
  let state = act(initialExercise(), {kind: "pilot", aircraftId: "demo-ground", text: "Request taxi"});
  state = act(state, {kind: "command", aircraftId: "demo-ground", frequency: "ground", text: "Standby", command: {type: "radio", message: "standby"}});
  assert.equal(frequencyPendingRequests(state).ground, 0);
  assert.ok(pendingPilotMessage(state, "demo-ground", "ground"));
  state = act(state, {kind: "command", aircraftId: "demo-ground", frequency: "ground", text: "Hold position", command: {type: "stop"}});
  assert.equal(frequencyPendingRequests(state).ground, 0);
});

test("legacy snapshots preserve read history and migrate only the pending tail", () => {
  const state = initialExercise();
  state.messages = Array.from({length: 4}, (_, i) => ({id: `legacy-${i}`, aircraftId: "demo-ground", time: i, frequency: i < 3 ? "ground" : "tower", sender: "pilot", text: "Request"}));
  state.aircraft[1].pending = 1;
  let restored = restoreExercise(state);
  assert.equal(unreadMessages(restored, "demo-ground", "ground"), 0);
  assert.equal(unreadMessages(restored, "demo-ground", "tower"), 1);
  assert.equal(state.messages[0].read, undefined); // Restoration never mutates the stored input.
  restored = act(restored, {kind: "read", aircraftId: "demo-ground", frequency: "tower"});
  assert.equal(unreadMessages(restoreExercise(restored), "demo-ground"), 0);
  state.aircraft[1].pending = 0;
  assert.equal(unreadMessages(restoreExercise(state), "demo-ground"), 0);
});

test("off-frequency tags require selection, including untuned traffic; staff sees unified tags", () => {
  const a = initialExercise().aircraft[0];
  assert.equal(aircraftTagVisible(a, "ground", null), false);
  assert.equal(aircraftTagVisible(a, "ground", a.id), true);
  assert.equal(aircraftTagVisible(a, "tower", null), true);
  a.frequency = null;
  assert.equal(aircraftTagVisible(a, "tower", null), false);
  assert.equal(aircraftTagVisible(a, "tower", a.id), true);
  assert.equal(aircraftTagVisible(a, "all", null), true);
});

test("ATIS runway color represents the wind direction independently of selection", () => {
  assert.equal(runwayWind(240), "headwind");
  assert.equal(runwayWind(60), "tailwind");
  assert.equal(runwayWind(150), "crosswind");
  assert.equal(runwayWind(330), "crosswind");
  assert.equal(runwayWind(0, 360), "headwind");
});

test("only staff Pause sets the concealment state; Play and Reset clear it", () => {
  let state = initialExercise(); assert.equal(state.pausedByStaff, false);
  state = act(state, {kind: "pause"}); assert.equal(state.pausedByStaff, true); assert.equal(state.running, false);
  state = act(state, {kind: "play"}); assert.equal(state.pausedByStaff, false); assert.equal(state.running, true);
  state = act(act(state, {kind: "pause"}), {kind: "reset"}); assert.equal(state.pausedByStaff, false);
});

const actForTrainerImprovements = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
};

const engine = engineFor({airport: "KDAL"});

const point = (runway: string, along: number, lateral = 0) => {
  const g = engine.runwayGeometry(runway);
  return {x: g.threshold.x + along * g.vector.x - lateral * g.vector.y, y: g.threshold.y + along * g.vector.y + lateral * g.vector.x};
};

const stateOf = (aircraft: Aircraft[]): Exercise => ({...engine.initialExercise(), aircraft, running: true});

const assign = (state: Exercise, instruction: Instruction) => actForTrainerImprovements(state, {kind: "maneuver", aircraftId: state.aircraft[0].id, command: instruction});

const radioTick = (state: Exercise) => autoReadbacks(advance(state, 2), 2000, randomUUID);

test("Tower contact before arrival at the hold reports ready exactly once; Automatic off stays manual", () => {
  const runway = "31L", hold = {...point(runway, .15, .04), hold: true};
  const a = {...engine.newAircraft("a", false), mode: "taxi" as const, runway, position: {...hold, x: hold.x + .04}, taxiPath: [hold], taxiIndex: 0, heading: 270, targetHeading: 270, speed: 15, targetSpeed: 15};
  let state = assign(stateOf([a]), {type: "frequency", frequency: "tower"});
  assert.equal(state.aircraft[0].towerCheckInPending, true);
  assert.equal(radioTick(state).messages.length, 0, "cannot report ready while still taxiing");
  state = restoreExercise(exerciseSchema.parse(state));
  for (let t = 0; t < 90 && !state.messages.length; t++) state = radioTick(state);
  assert.equal(state.messages.length, 1);
  assert.match(state.messages[0].text, /ready for departure at runway 31L/);
  state = radioTick(state); assert.equal(state.messages.length, 1);
  const off = radioTick({...stateOf([a]), autoReadback: false}); assert.equal(off.messages.length, 0);
});
