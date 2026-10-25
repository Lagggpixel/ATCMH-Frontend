import assert from "node:assert/strict";
import test from "node:test";
import {airportList, airportRunways, getAirport, runwayEnds} from "./airports";
import {engineFor} from "./engine";
import {EXERCISE_WEATHER, type Aircraft} from "./model";
import {runwayOccupied} from "./runway-safety";
import {buildTaxiGraph} from "./taxi-routing";

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

test("a departure waiting at Heathrow A1 does not send a cleared arrival around", () => {
  const engine = engineFor({airport: "EGLL"}), airport = getAirport({airport: "EGLL"}), g = engine.runwayGeometry("27R");
  const departure: Aircraft = {...engine.newAircraft("departure", false), callsign: "Virgin 802 Heavy", runway: "27R", mode: "parked",
    position: {x: .993749003157175, y: .37596036239199}, altitude: airport.elevation, speed: 0, targetSpeed: 0};
  const arrival: Aircraft = {...engine.newAircraft("arrival", true), callsign: "Shamrock 406", runway: "27R", mode: "pattern", leg: "final", frequency: "tower",
    position: {x: g.threshold.x - g.vector.x * .15, y: g.threshold.y - g.vector.y * .15}, altitude: airport.elevation + 49,
    heading: g.heading, targetHeading: g.heading, speed: 137, targetSpeed: 137, clearedToLand: true};
  assert.equal(runwayOccupied(airport, "27R", [departure, arrival], arrival.id), false);
  assert.equal(runwayOccupied(airport, "09L", [departure, arrival], arrival.id), false, "reciprocal runway uses the same hold");
  let state = engine.restoreExercise(JSON.parse(JSON.stringify({...engine.initialExercise(), running: true, aircraft: [departure, arrival]})));
  state = engine.advance(state, .1);
  assert.equal(state.aircraft[1].mode, "pattern");
  assert.equal(state.aircraft[1].clearedToLand, true);
  assert.deepEqual(state.aircraft[0].position, departure.position, "the saved departure is not repositioned");
});

test("mapped hold exceptions never hide runway entries, moving aircraft or uncleared arrivals", () => {
  const engine = engineFor({airport: "EGLL"}), airport = getAirport({airport: "EGLL"}), g = engine.runwayGeometry("27R");
  const stopped: Aircraft = {...engine.newAircraft("hold", false), runway: "27R", mode: "parked", position: {x: .993749003157175, y: .37596036239199},
    altitude: airport.elevation, speed: 0, targetSpeed: 0};
  assert.equal(runwayOccupied(airport, "27R", [{...stopped, mode: "taxi", holding: true}], "arrival"), false);
  const inward = {x: stopped.position.x + g.vector.y * .002, y: stopped.position.y - g.vector.x * .002};
  const radar = engineFor({trainingStation: "EGPH:approach"}).newAircraft("radar", true).radar!;
  for (const patch of [
    {position: g.threshold}, {position: inward}, {mode: "lineup"}, {mode: "rollout"}, {mode: "takeoff"},
    {mode: "taxi", targetSpeed: 15}, {speed: 2}, {targetSpeed: 15},
    {arrivalExit: {instruction: "automatic", speed: 15}}, {runwayExit: [{...stopped.position}]},
    {radar: {...radar, arrival: {runway: "27R", phase: "vacating"}}},
  ] as Partial<Aircraft>[]) assert.equal(runwayOccupied(airport, "27R", [{...stopped, ...patch}], "arrival"), true, JSON.stringify(patch));
});

test("mapped holding points on both sides of every runway are clear for stopped departures", () => {
  for (const airport of airportList) {
    const graph = buildTaxiGraph(airport), engine = engineFor({airport: airport.icao});
    for (const pair of airportRunways(airport)) for (const end of pair.ends) {
      for (const index of graph.runwayHolds?.[pair.id] ?? []) {
        const departure: Aircraft = {...engine.newAircraft("hold", false), runway: end.id, mode: "parked", position: {...graph.points[index]},
          altitude: airport.elevation, speed: 0, targetSpeed: 0};
        assert.equal(runwayOccupied(airport, end.id, [departure], "arrival"), false, `${airport.icao}/${end.id}/${index}`);
      }
    }
  }
});
