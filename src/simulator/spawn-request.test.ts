import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor} from "./engine";
import {blankScenario, createScenarioExercise, seedFromAircraft} from "./scenarios";
import {advanceScenario} from "./scenario-engine";

for (const automatic of [true, false]) {
  test(`spawn calls once for ground and tower traffic with Automatic ${automatic}`, () => {
    const engine = engineFor({airport: "EGPH", trainingStation: "EGPH:local"});
    let state = {...engine.initialExercise(), aircraft: [], running: true, autoReadback: automatic};
    for (const [id, ground, ready, landing, frequency, expected] of [
      ["gate", true, false, "full-stop", "ground", "pushback"],
      ["taxi", true, true, "full-stop", "ground", "taxi-runway"],
      ["option", false, true, "touch-and-go", "tower", "inbound-option"],
      ["arrival", false, true, "full-stop", "tower", "inbound-land"],
    ] as const) {
      const aircraft = engine.newAircraft(id, !ground);
      Object.assign(aircraft, {callsign: `Test ${id}`, groundReady: ready, landing, frequency});
      const result = engine.applyEnvelope(state, {id: `spawn-${id}`, time: 10, action: {kind: "spawn", aircraft}});
      assert.equal(result.error, undefined); state = result.state;
      assert.equal(state.messages.at(-1)?.request?.id, expected);
      assert.equal(state.messages.filter(m => m.aircraftId === id).length, 1);
      assert.equal(engine.applyEnvelope(state, {id: `spawn-${id}`, time: 10, action: {kind: "spawn", aircraft}}).state.messages.length, state.messages.length);
    }
  });
  test(`radar spawn requests the selected approach once with Automatic ${automatic}`, () => {
    const engine = engineFor({airport: "EGPH", trainingStation: "EGPH:approach"});
    let state = {...engine.initialExercise(), aircraft: [], running: true, autoReadback: automatic};
    const aircraft = engine.newAircraft("arrival", true);
    aircraft.radar!.requestedApproach = state.radarEnvironment!.approaches.find(a => a.type === "gps")!.id;
    state = engine.applyEnvelope(state, {id: "spawn", time: 10, action: {kind: "spawn", aircraft}}).state;
    assert.equal(state.messages[0].request?.id, "request-approach");
    assert.match(state.messages[0].text, /requesting GPS approach/);
    state = engine.autoReadbacks(state, 11, randomUUID);
    assert.equal(state.messages.length, 1);
  });
}

test("an authored same-time scenario request replaces the default spawn call", () => {
  const definition = blankScenario({airport: "EGPH", trainingStation: "EGPH:local"});
  const engine = engineFor(definition), aircraft = engine.newAircraft("arrival", true);
  aircraft.frequency = "tower";
  definition.aircraft = [{key: "arrival", initial: false, seed: seedFromAircraft(aircraft)}];
  definition.events = [
    {id: "spawn", title: "Spawn", trigger: {type: "time", at: 1}, actions: [{type: "spawn", aircraftKey: "arrival"}]},
    {id: "call", title: "Call", trigger: {type: "time", at: 1}, actions: [{type: "request", aircraftKey: "arrival", requestId: "inbound-option", runway: aircraft.runway!}]},
  ];
  const created = createScenarioExercise(definition, "scenario", randomUUID());
  const state = advanceScenario({...created.exercise, running: true}, created.runtime, 2, 1000).exercise;
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].request?.id, "inbound-option");
  assert.equal(created.runtime.events.call.status, "completed");
});
