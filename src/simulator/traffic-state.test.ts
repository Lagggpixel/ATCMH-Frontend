import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor} from "./engine";
import {crossingHold} from "./command-ground";
import {getAirport} from "./airports";
import {pendingCommands, type Action, type Exercise} from "./model";
import {exerciseSchema} from "./protocol";

const local = engineFor({trainingStation: "EGPH:local"});
function fixture() {
  const state = local.initialExercise(randomUUID()), a = local.newAircraft("crossing", false);
  Object.assign(a, {mode: "taxi", position: {x: 5, y: 5}, heading: 0, targetHeading: 0, speed: 15, targetSpeed: 15, taxiIndex: 1,
    taxiPath: [{x: 5, y: 5}, {x: 5, y: 5.03}, {x: 5, y: 5.06}, {x: 5, y: 5.12, hold: true, runway: "24"}, {x: 5, y: 5.2}, {x: 5, y: 5.3, hold: true, runway: "24"}]});
  state.aircraft = [a]; state.running = true; state.autoReadback = false;
  return state;
}
function act(state: Exercise, action: Action, engine = local) {
  const result = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action});
  assert.equal(result.error, undefined); return result.state;
}
const cross = (state: Exercise) => act(state, {kind: "maneuver", aircraftId: state.aircraft[0].id, command: {type: "cross", runway: "06"}});

test("early crossing survives intermediate waypoints, reload and prediction and releases only one hold", () => {
  let state = cross(fixture());
  assert.equal(state.aircraft[0].releasedHold, 3);
  state = local.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  const original = structuredClone(state);
  for (let t = 0; t < 85; t++) state = local.advance(state, 1);
  const a = state.aircraft[0];
  assert.equal(a.taxiIndex, 5); assert.equal(a.holding, true); assert.equal(a.releasedHold, null);
  assert.deepEqual(a.position, {x: 5, y: 5.3});
  const predicted = local.predictAircraft(original.aircraft, 5);
  assert.equal(predicted[0].releasedHold, 3); assert.deepEqual(original.aircraft[0].position, {x: 5, y: 5});
});

test("automatic early crossing readback succeeds and keeps the queued Tower switch until the departure hold", () => {
  let state = fixture(); state.autoReadback = true; state.aircraft[0].contactTowerAtHold = true;
  const id = state.aircraft[0].id;
  state = act(state, {kind: "command", aircraftId: id, frequency: "ground", text: "Cross runway 24", command: {type: "cross", runway: "24", expedite: true}});
  state = local.autoReadbacks(local.advance(state, 2), 2000, randomUUID);
  assert.match(state.messages.at(-1)!.text, /Crossing runway/);
  assert.equal(state.aircraft[0].contactTowerAtHold, true); assert.equal(state.aircraft[0].releasedHold, 3);
  for (let t = 0; t < 80; t++) state = local.advance(state, 1);
  assert.equal(state.aircraft[0].frequency, "tower"); assert.equal(state.aircraft[0].holding, true);
});

test("crossing rejects a different first runway, a missing crossing and an endpoint hold", () => {
  const state = fixture(), a = state.aircraft[0];
  assert.match(crossingHold(getAirport(), a, "18").error!, /match the runway/);
  a.taxiPath = a.taxiPath.map(p => ({...p, hold: false}));
  assert.match(crossingHold(getAirport(), a, "24").error!, /no upcoming/);
  a.taxiPath.at(-1)!.hold = true;
  assert.match(crossingHold(getAirport(), a, "24").error!, /ends at this hold/);
});

test("an early clearance does not resume a manual stop or waive give-way instructions", () => {
  const initial = fixture(), a = initial.aircraft[0]; a.holding = true; a.targetSpeed = 0;
  a.giveWay = {aircraftId: "leader", description: "aircraft ahead"};
  let state = cross(initial);
  assert.equal(state.aircraft[0].holding, true); assert.equal(state.aircraft[0].targetSpeed, 0);
  assert.deepEqual(state.aircraft[0].giveWay, a.giveWay);
  state = act(state, {kind: "maneuver", aircraftId: a.id, command: {type: "stop"}});
  assert.equal(state.aircraft[0].releasedHold, null);
});

test("reroutes, route drags, repositioning and Hold Short invalidate early crossing clearance", () => {
  for (const kind of ["drag", "route", "position", "hold-short"] as const) {
    let state = cross(fixture()); const a = state.aircraft[0];
    state = act(state, kind === "drag" ? {kind: "taxi-path", aircraftId: a.id, path: a.taxiPath, edit: {kind: "insert", index: 2, point: {x: 5, y: 5.04}}}
      : kind === "hold-short" ? {kind: "maneuver", aircraftId: a.id, command: {type: "hold-short", runway: "24"}}
      : {kind: "edit", aircraftId: a.id, patch: kind === "route" ? {taxiPath: a.taxiPath} : {position: a.position}});
    assert.equal(state.aircraft[0].releasedHold, null, kind);
  }
});

test("a crossing reminder cannot grant an otherwise missing clearance", () => {
  let state = fixture(); const a = state.aircraft[0]; a.position = {...a.taxiPath[3]}; a.taxiIndex = 3; a.holding = true;
  state = act(state, {kind: "maneuver", aircraftId: a.id, command: {type: "atc", action: "progressive", variant: "crossed"}});
  assert.equal(state.aircraft[0].releasedHold, null); assert.equal(state.aircraft[0].holding, true);
});

test("handoff readback alone keeps the tuned frequency, assignment switches it", () => {
  for (const assign of [false, true]) {
    let state = fixture(); const a = state.aircraft[0];
    state = act(state, {kind: "command", aircraftId: a.id, frequency: "ground", text: "Contact Tower", command: {type: "frequency", frequency: "tower"}});
    state = act(state, {kind: "pilot", aircraftId: a.id, replyTo: state.messages.at(-1)!.id, text: "Contacting Tower", assign});
    assert.equal(state.aircraft[0].frequency, assign ? "tower" : "ground");
    assert.equal(state.messages.at(-1)!.frequency, "ground", "the readback belongs to the original frequency");
  }
});

test("retuning retires old pending commands permanently while preserving history", () => {
  let state = fixture(); const a = state.aircraft[0];
  state = act(state, {kind: "command", aircraftId: a.id, frequency: "ground", text: "Hold position", command: {type: "stop"}});
  assert.equal(pendingCommands(state, a.id).length, 1);
  state = act(state, {kind: "edit", aircraftId: a.id, patch: {frequency: "tower"}});
  assert.equal(pendingCommands(state, a.id).length, 0);
  state = act(state, {kind: "edit", aircraftId: a.id, patch: {frequency: "ground"}});
  state = local.restoreExercise(exerciseSchema.parse(state));
  assert.equal(pendingCommands(state, a.id).length, 0); assert.equal(state.messages[0].text, "Hold position");
  assert.equal(state.aircraft[0].holding, false);
});
