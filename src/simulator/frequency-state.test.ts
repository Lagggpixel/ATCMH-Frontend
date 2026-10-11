import assert from "node:assert/strict";
import test from "node:test";
import {applyEnvelope, initialExercise, restoreExercise} from "./engine";
import {aircraftTagVisible, frequencyPendingRequests, runwayWind, unreadMessages, type Action, type Exercise} from "./model";
import {exerciseSchema} from "./protocol";

let id = 0;
const act = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: `frequency-${++id}`, time: 1791540000000, action});
  assert.equal(result.error, undefined); return result.state;
};
test("frequency request counts match current strips and clear when read", () => {
  let state = initialExercise();
  for (let i = 0; i < 5; i++) state = act(state, {kind: "pilot", aircraftId: "demo-ground", text: `Request ${i}`});
  state = act(state, {kind: "pilot", aircraftId: "demo-air", text: "Request pattern"});
  assert.deepEqual(frequencyPendingRequests(state), {ground: 5, tower: 1, atis: 0});
  state = act(state, {kind: "read", aircraftId: "demo-ground", frequency: "ground"});
  assert.deepEqual(frequencyPendingRequests(state), {ground: 0, tower: 1, atis: 0});
  state = act(state, {kind: "pilot", aircraftId: "demo-ground", text: "Changing channel"});
  state = act(state, {kind: "edit", aircraftId: "demo-ground", patch: {frequency: "tower"}});
  assert.deepEqual(frequencyPendingRequests(state), {ground: 0, tower: 1, atis: 0});
  state = act(state, {kind: "remove", aircraftId: "demo-air"});
  assert.deepEqual(frequencyPendingRequests(state), {ground: 0, tower: 0, atis: 0});
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
    assert.equal(unreadMessages(state, "demo-ground", from), 1); // Only the new readback on the original frequency.
    state = act(state, {kind: "pilot", aircraftId: "demo-ground", text: "With you"});
    assert.equal(unreadMessages(state, "demo-ground", to), 1);
    state = act(state, {kind: "read", aircraftId: "demo-ground", frequency: to});
    assert.equal(unreadMessages(state, "demo-ground", from), 1);
    assert.equal(unreadMessages(state, "demo-ground", to), 0);
    state = restoreExercise(exerciseSchema.parse(state));
    assert.equal(unreadMessages(state, "demo-ground", to), 0);
    assert.equal(state.messages[0].read, true);
  }
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
