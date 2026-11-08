import {withFixedReadbackDelay} from "./test-exercise";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {advance, applyEnvelope, autoReadbacks, initialExercise, newAircraft} from "./engine";
import {advanceScenario} from "./scenario-engine";
import {blankScenario, createScenarioExercise, eventsWaitingOn, seedFromAircraft, type ScenarioDefinition} from "./scenarios";
import {envelopeSchema, menteeActionAllowed} from "./protocol";
import {pilotAutomatic, type Action, type Exercise} from "./model";

const send = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: randomUUID(), time: 0, action});
  assert.equal(result.error, undefined);
  return result.state;
};
const clearToLand = (state: Exercise) => send(state, {kind: "command", aircraftId: "demo-air", frequency: "tower", text: "cleared to land", command: {type: "land", runway: "24", number: 1}});
const readbacks = (state: Exercise) => autoReadbacks(advance(state, 2), 2000, randomUUID).messages.filter(m => m.sender === "pilot" && m.commandId !== undefined);

test("one aircraft can be flown by hand while the rest of the session stays automatic", () => {
  let state = send({...withFixedReadbackDelay(initialExercise("by-hand")), running: true}, {kind: "auto-readback", enabled: true});
  state = send(state, {kind: "aircraft-automatic", aircraftId: "demo-air", enabled: false});
  assert.equal(pilotAutomatic(state, state.aircraft[0]), false);
  assert.equal(pilotAutomatic(state, state.aircraft[1]), true);
  state = clearToLand(state);
  assert.equal(state.messages.at(-1)!.autoReadbackAt, undefined);
  assert.equal(readbacks(state).length, 0);
});

test("one aircraft can read back automatically while the session is by hand, and can return to following the session", () => {
  let state = send({...withFixedReadbackDelay(initialExercise("automatic")), running: true}, {kind: "auto-readback", enabled: false});
  state = clearToLand(state);
  assert.equal(state.messages.at(-1)!.autoReadbackAt, undefined);
  // Switching the aircraft to automatic arms its outstanding instruction, as the session switch does.
  state = send(state, {kind: "aircraft-automatic", aircraftId: "demo-air", enabled: true});
  assert.ok(state.messages.at(-1)!.autoReadbackAt !== undefined);
  assert.equal(readbacks(state).length, 1);
  state = send(state, {kind: "aircraft-automatic", aircraftId: "demo-air", enabled: null});
  assert.equal(state.aircraft[0].automatic, undefined);
  assert.equal(state.messages.at(-1)!.autoReadbackAt, undefined);
});

test("the per-aircraft automation switch is staff-only and survives the session schema", () => {
  const action = {kind: "aircraft-automatic", aircraftId: "demo-air", enabled: false} as const;
  assert.ok(envelopeSchema.safeParse({id: "a", time: 1, action}).success);
  assert.equal(menteeActionAllowed(action), false);
});

function scenario(events: ScenarioDefinition["events"]): ScenarioDefinition {
  const air = newAircraft("air", true); Object.assign(air, {mode: "heading", heading: 90, targetHeading: 90, altitude: 1500, targetAltitude: 1500, frequency: "tower"});
  return {...blankScenario(), title: "Triggers", aircraft: [{key: "air", initial: true, seed: seedFromAircraft(air)}], events};
}

test("a delayed condition fires only if it still holds when the delay ends", () => {
  const {runtime, exercise} = createScenarioExercise(scenario([{id: "watch", title: "Watch", trigger: {type: "condition", delay: 10, condition: {type: "frequency", aircraftKey: "air", frequency: "tower"}}, actions: [{type: "note", text: "Fired"}]}]), "session", randomUUID());
  const id = runtime.aircraftIds.air;
  let state = advanceScenario({...exercise, running: true}, runtime, 1, 1000).exercise;
  assert.ok(runtime.events.watch.conditionAt !== undefined);
  state = send(state, {kind: "edit", aircraftId: id, patch: {frequency: "approach"}});
  state = advanceScenario(state, runtime, 5, 2000).exercise;
  state = advanceScenario(state, runtime, 5, 3000).exercise;
  assert.equal(runtime.events.watch.status, "scheduled");
  assert.equal(runtime.events.watch.conditionAt, undefined);
  // Back on frequency, the delay starts again from that moment.
  state = send(state, {kind: "edit", aircraftId: id, patch: {frequency: "tower"}});
  state = advanceScenario(state, runtime, 5, 4000).exercise;
  assert.equal(runtime.events.watch.status, "scheduled");
  advanceScenario(state, runtime, 5, 5000);
  advanceScenario(state, runtime, 1, 6000);
  assert.equal(runtime.events.watch.status, "completed");
});

test("the live panel can list every event held up by a blocked one, through a chain", () => {
  const events: ScenarioDefinition["events"] = [
    {id: "a", title: "A", trigger: {type: "manual"}, actions: []},
    {id: "b", title: "B", trigger: {type: "condition", delay: 0, condition: {type: "event", eventId: "a"}}, actions: []},
    {id: "c", title: "C", trigger: {type: "condition", delay: 5, condition: {type: "event", eventId: "b"}}, actions: []},
    {id: "d", title: "D", trigger: {type: "time", at: 30}, actions: []},
  ];
  assert.deepEqual(eventsWaitingOn("a", events), ["b", "c"]);
  assert.deepEqual(eventsWaitingOn("c", events), []);
});
