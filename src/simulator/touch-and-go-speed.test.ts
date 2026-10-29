import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {engineFor} from "./engine";
import {exerciseSchema} from "./protocol";
import {EXERCISE_WEATHER, type Instruction} from "./model";

for (const instruction of [{type: "radar-speed", mode: "slowest"}, {type: "speed", value: 130}] as Instruction[]) {
  test(`EGLL touch-and-go releases ${instruction.type} speed after touchdown`, () => {
    const airport = getAirport({airport: "EGLL"});
    const engine = engineFor({airport: "EGLL", weather: {...EXERCISE_WEATHER, windSpeed: 0}});
    const g = engine.runwayGeometry("27L"), a = engine.newAircraft("delta", true);
    Object.assign(a, {callsign: "Delta 8860", type: "A320", performanceProfile: "A320", runway: "27L", frequency: "tower",
      position: {x: g.threshold.x - g.vector.x * .5, y: g.threshold.y - g.vector.y * .5},
      heading: g.heading, targetHeading: g.heading, altitude: airport.elevation + 100, speed: 130, targetSpeed: 130,
      mode: "pattern", leg: "final", landing: "touch-and-go", clearedToLand: true, clearedForOption: true,
      speedTargets: {"upwind-downwind": 175, vref: 130}});
    let state = {...engine.initialExercise(), aircraft: [a], running: true};
    const result = engine.applyEnvelope(state, {id: "speed", time: 1, action: {kind: "maneuver", aircraftId: a.id, command: instruction}});
    assert.equal(result.error, undefined); state = result.state;
    if (instruction.type === "radar-speed") state.aircraft[0].assigned = {runway: "27L", landing: true, speed: instruction};
    const before = structuredClone(state);
    state = engine.advance(state, 1);
    assert.equal(state.aircraft[0].speedMode, "manual", "approach restriction remains active before touchdown");
    assert.deepEqual(before.aircraft[0], result.state.aircraft[0], "advancing must not mutate the input snapshot");
    for (let i = 0; i < 40 && state.aircraft[0].mode !== "takeoff"; i++) state = engine.advance(state, 1);
    const takeoff = state.aircraft[0];
    assert.equal(takeoff.mode, "takeoff");
    assert.equal(takeoff.speedMode, "auto");
    assert.equal(takeoff.speedInstruction, undefined);
    assert.deepEqual(takeoff.speedTargets, {"upwind-downwind": 175, vref: 130});
    if (instruction.type === "radar-speed") assert.equal(takeoff.assigned?.speed, null);
    state = engine.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    for (let i = 0; i < 30; i++) state = engine.advance(state, 1);
    assert.ok(state.aircraft[0].altitude > airport.elevation + 300, "aircraft rotates and climbs after reload");
    assert.equal(state.aircraft[0].takeoffOutcome, undefined);
  });
}
