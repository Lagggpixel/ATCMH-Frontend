import assert from "node:assert/strict";
import test from "node:test";
import {AIRPORT, newAircraft} from "./engine";
import {blankScenario, createScenarioExercise, normalizeScenario, scenarioGates, scenarioSchema, seedFromAircraft, standPlacement} from "./scenarios";

test("ground scenario spawns use mapped gates while airborne positions remain configurable", () => {
  const gateId = scenarioGates[0].id, air = newAircraft("air", true), ground = newAircraft("ground", false);
  ground.position = {x: 20, y: 20}; ground.mode = "taxi"; ground.speed = ground.targetSpeed = 15;
  air.position = {x: -12, y: 8};
  const definition = {...blankScenario(), aircraft: [
    {key: "ground", initial: true, gateId, seed: seedFromAircraft(ground)},
    {key: "air", initial: false, seed: seedFromAircraft(air)},
  ], events: [{id: "arrival", title: "Arrival", trigger: {type: "time" as const, at: 1}, actions: [{type: "spawn" as const, aircraftKey: "air"}]}]};
  const normalized = normalizeScenario(scenarioSchema.parse(definition));
  assert.deepEqual(normalized.aircraft[0].seed.position, standPlacement(gateId)!.position);
  assert.equal(normalized.aircraft[0].seed.mode, "parked");
  assert.equal(normalized.aircraft[0].seed.altitude, AIRPORT.elevation);
  assert.equal(normalized.aircraft[0].seed.speed, 0);
  assert.deepEqual(normalized.aircraft[1].seed, definition.aircraft[1].seed);
  const {exercise} = createScenarioExercise(definition, "session", "generation");
  assert.deepEqual(exercise.aircraft[0].position, standPlacement(gateId)!.position);
  assert.deepEqual(definition.aircraft[0].seed.position, {x: 20, y: 20}, "source definitions are not mutated");
});

test("legacy scenarios without gate identifiers still load and spawn ground aircraft at a gate", () => {
  const definition = {...blankScenario(), aircraft: [{key: "ground", initial: true, seed: seedFromAircraft(newAircraft("ground", false))}]};
  assert.equal(scenarioSchema.safeParse(definition).success, true);
  const normalized = normalizeScenario(definition), gate = normalized.aircraft[0].gateId!;
  assert.ok(scenarioGates.some(g => g.id === gate));
  assert.deepEqual(createScenarioExercise(definition, "session", "generation").exercise.aircraft[0].position, standPlacement(gate)!.position);
  assert.equal(scenarioSchema.safeParse({...definition, aircraft: [{...definition.aircraft[0], gateId: "missing-gate"}]}).success, false);
});
