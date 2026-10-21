import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {CALLSIGN_OPERATORS, callsignConflict, callsignNumber, exerciseCallsigns, randomCallsign} from "./callsigns";
import {engineFor, restoreExercise} from "./engine";
import {exerciseSchema} from "./protocol";
import {blankScenario, createScenarioExercise, scenarioSchema, storedScenarioSchema, scenarioRuntimeSchema, seedFromAircraft} from "./scenarios";
import type {Action, Exercise} from "./model";

function act(state: Exercise, action: Action) {
  const result = engineFor(state).applyEnvelope(state, {id: randomUUID(), time: 0, action});
  assert.equal(result.error, undefined); return result.state;
}
test("random additions vary operators and numbers without duplicates, even with a constant random source", () => {
  const existing: string[] = ["Speedbird 001", "Easy 2"], operators = new Set<string>();
  let seed = 42;
  const random = () => {seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32;};
  for (let i = 0; i < 1000; i++) {
    const callsign = randomCallsign(existing, random);
    assert.equal(callsignConflict(callsign, existing), undefined); existing.push(callsign);
    operators.add(callsign.replace(/ \d+$/, ""));
  }
  assert.equal(operators.size, CALLSIGN_OPERATORS.length);
  assert.equal(new Set(existing.map(callsignNumber)).size, existing.length);
  const first = randomCallsign(existing, () => 0), second = randomCallsign([...existing, first], () => 0);
  assert.notEqual(callsignNumber(first), callsignNumber(second));
  assert.throws(() => randomCallsign(Array.from({length: 9999}, (_, i) => `Test ${i + 1}`)), /No unused/);
});
test("callsign validation normalizes formatting, case and leading zeroes", () => {
  assert.match(callsignConflict(" speedbird124 ", ["Speedbird 124"])!, /callsign is/);
  assert.match(callsignConflict("Delta 0124", ["Speedbird 124"])!, /number is/);
  assert.equal(callsignConflict("Delta 125", ["Speedbird 124"]), undefined);
  assert.equal(callsignNumber("G-ABCD"), undefined);
});
for (const station of ["ground", "approach", "center"] as const) test(`${station}: spawn/edit enforce uniqueness and deletion/reload retains number reservations`, () => {
  const engine = engineFor({trainingStation: `EGPH:${station}`}); let state = engine.initialExercise();
  const added = engine.newAircraft(randomUUID(), true); added.callsign = "Delta 7";
  state = act(state, {kind: "spawn", aircraft: added});
  const second = {...structuredClone(added), id: randomUUID(), callsign: "United 007"};
  assert.match(engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: second}}).error!, /number is/);
  assert.match(engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "edit", aircraftId: added.id, patch: {callsign: state.aircraft[0].callsign}}}).error!, /callsign is/);
  state = act(state, {kind: "edit", aircraftId: added.id, patch: {callsign: "Qatar 8"}});
  state = act(state, {kind: "remove", aircraftId: added.id});
  state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  for (const callsign of ["United 7", "Emirates 8"]) {
    assert.match(engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: {...second, callsign}}}).error!, /number is/);
  }
  assert.equal(callsignConflict(randomCallsign(exerciseCallsigns(state)), exerciseCallsigns(state)), undefined);
});
test("scenario authoring rejects duplicate numbers and reserves scheduled traffic before it spawns", () => {
  const definition = blankScenario({trainingStation: "EGPH:approach"}), engine = engineFor(definition);
  const first = engine.newAircraft("first", true), second = engine.newAircraft("second", true);
  first.callsign = "Delta 7"; second.callsign = "Qatar 8";
  definition.aircraft = [{key: "first", initial: true, seed: seedFromAircraft(first)}, {key: "second", initial: false, seed: seedFromAircraft(second)}];
  definition.events = [{id: "spawn-second", title: "Second", trigger: {type: "time", at: 20}, actions: [{type: "spawn", aircraftKey: "second"}]}];
  assert.equal(scenarioSchema.safeParse(definition).success, true);
  const {exercise, runtime} = createScenarioExercise(definition, randomUUID(), randomUUID());
  assert.ok(exerciseCallsigns(exercise).includes("Qatar 8"));
  const impostor = {...second, id: randomUUID(), callsign: "United 8"};
  assert.match(engine.applyEnvelope(exercise, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: impostor}}).error!, /number is/);
  act(exercise, {kind: "spawn", aircraft: {...second, id: runtime.aircraftIds.second}});
  definition.aircraft[1].seed.callsign = "United 007";
  assert.equal(scenarioSchema.safeParse(definition).success, false);
  assert.equal(storedScenarioSchema.safeParse(definition).success, true, "historical scenarios remain readable for correction");
  runtime.definition = definition;
  assert.equal(scenarioRuntimeSchema.safeParse(runtime).success, true, "existing attempts remain readable");
});
