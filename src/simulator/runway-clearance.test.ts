import assert from "node:assert/strict";
import test from "node:test";
import {airportList, getAirport, runwayEnds} from "./airports";
import {engineFor} from "./engine";
import {EXERCISE_WEATHER, type Aircraft} from "./model";
import {runwayOccupied} from "./runway-safety";

for (const airport of airportList) test(`${airport.icao}: paired and ordinary arrivals agree at every runway exit boundary`, () => {
  const engine = engineFor({airport: airport.icao, weather: {...EXERCISE_WEATHER, windSpeed: 0}});
  for (const end of runwayEnds(airport)) for (const side of [-1, 1]) for (const offset of [-1e-5, -5e-8, 0, 1e-5]) {
    const g = engine.runwayGeometry(end.id), lateral = side * (g.clearance + offset);
    const point = (along: number, across: number) => ({x: g.threshold.x + g.vector.x * along - g.vector.y * across, y: g.threshold.y + g.vector.y * along + g.vector.x * across});
    const leader: Aircraft = {...engine.newAircraft("leader", false), runway: end.id, mode: "parked", holding: true, position: point(.2, lateral), altitude: airport.elevation, speed: 0};
    const follower: Aircraft = {...engine.newAircraft("follower", true), runway: end.id, mode: "pattern", leg: "final", frequency: "tower", position: point(-.1, 0), altitude: airport.elevation + 49, speed: 135, targetSpeed: 135, heading: g.heading, targetHeading: g.heading, clearedToLand: true};
    const occupied = offset < -1e-7;
    assert.equal(runwayOccupied(airport, end.id, [leader, follower], follower.id), occupied, `${end.id}/${side}/${offset}: occupancy`);
    for (const paired of [false, true]) {
      const state = {...engine.initialExercise(), running: true, aircraft: structuredClone([leader, follower]), conflicts: paired ? [{id: "ga", kind: "ga" as const, first: leader.id, second: follower.id, runway: end.id, otherRunway: end.id, phase: "active" as const, started: 0, circuit: 0, rollAt: 0}] : []};
      const next = engine.advance(state, .00001);
      assert.equal(next.aircraft[1].mode === "go-around", occupied, `${end.id}/${side}/${offset}: paired=${paired}`);
      if (paired) {
        assert.equal(next.conflicts![0].phase, occupied ? "complete" : "cancelled");
        if (!occupied) assert.match(next.conflicts![0].outcome!, /did not materialise/);
      }
    }
  }
});

test("recorded Swiss 8668 KDAL exit endpoint cannot trigger a late go-around after restore", () => {
  const engine = engineFor({airport: "KDAL"}), airport = getAirport({airport: "KDAL"}), g = engine.runwayGeometry("31R");
  const leader = {...engine.newAircraft("swiss", false), runway: "31R", mode: "parked" as const, position: {x: -.4936585001322065, y: .7100306183455044}, speed: 0, targetSpeed: 0};
  const follower = {...engine.newAircraft("american", true), runway: "31R", mode: "pattern" as const, leg: "final" as const, position: {x: g.threshold.x - g.vector.x * .1, y: g.threshold.y - g.vector.y * .1}, heading: g.heading, targetHeading: g.heading, altitude: airport.elevation + 49, clearedToLand: true};
  const state = {...engine.initialExercise(), running: true, aircraft: [leader, follower], conflicts: [{id: "ga", kind: "ga" as const, first: leader.id, second: follower.id, runway: "31R", otherRunway: "31R", phase: "active" as const, circuit: 0, started: 0, rollAt: 0}]};
  const next = engine.advance(engine.restoreExercise(JSON.parse(JSON.stringify(state))), .05);
  assert.equal(next.aircraft[1].mode, "pattern");
  assert.equal(next.conflicts![0].phase, "cancelled");
  assert.match(next.conflicts![0].outcome!, /did not materialise/);
});
