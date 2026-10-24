import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {catalogFor} from "./catalog";
import {getAirport} from "./airports";
import {blankScenario, createScenarioExercise, scenarioSchema, seedFromAircraft} from "./scenarios";
import {advanceScenario} from "./scenario-engine";

test("historical pattern-entry IDs and labels still execute without changing the scenario or restoring manual controls", () => {
  const engine = engineFor(), aircraft = engine.newAircraft("legacy", true);
  aircraft.frequency = "tower";
  for (const request of [{requestId: "pattern-entry"}, {label: "Request pattern entry"}]) {
    const definition = {...blankScenario(), aircraft: [{key: "target", initial: true, seed: seedFromAircraft(aircraft)}],
      events: [{id: "legacy", title: "Legacy request", trigger: {type: "time" as const, at: 0},
        actions: [{type: "request" as const, aircraftKey: "target", runway: "06", ...request}]}]};
    const before = JSON.stringify(definition);
    const {exercise, runtime} = createScenarioExercise(scenarioSchema.parse(definition), "legacy", "generation");
    exercise.running = true;
    const result = advanceScenario(exercise, runtime, 0, 1000).exercise;
    assert.equal(runtime.events.legacy.status, "completed");
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].request?.id, "pattern-entry");
    assert.equal(JSON.stringify(definition), before);
    assert.ok(!catalogFor(getAirport(exercise)).pilotRequests(result.aircraft[0]).some(r => r.id === "pattern-entry"));
  }
});

test("manual pattern-entry requests stay unavailable and the legacy option cannot bypass a non-Tower frequency", () => {
  const engine = engineFor(), state = engine.initialExercise(); state.aircraft = [engine.newAircraft("manual", true)];
  const envelope = {id: "manual", time: 0, action: {kind: "pilot" as const, aircraftId: "manual", text: "", request: {id: "pattern-entry" as const, runway: "06"}}};
  assert.match(engine.applyEnvelope(state, envelope).error!, /unavailable/);
  state.aircraft[0].frequency = "ground";
  assert.match(engine.applyEnvelope(state, envelope, {legacyPatternEntry: true}).error!, /unavailable/);
});
