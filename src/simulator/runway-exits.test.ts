import assert from "node:assert/strict";
import test from "node:test";
import {airportList, airportRunways, getAirport, runwayEnds} from "./airports";
import {engineFor, restoreExercise} from "./engine";
import {EXERCISE_WEATHER, type Aircraft, type Exercise} from "./model";
import {exerciseSchema} from "./protocol";
import {radarPerformance} from "./radar-speed";
import {moveRadar, radarEnvironmentFor} from "./radar";
import {runwayOccupied} from "./runway-safety";
import {runwayTurn} from "./ground-movement";
import kbhmLegacy from "./data/kbhm-before-runway-repair.json";
import sbbrLegacy from "./data/sbbr-before-runway-repair.json";
import rjttLegacy from "./data/rjtt-before-runway-repair.json";

for (const airport of airportList) test(`${airport.icao}: forward exits, bounded rollout, occupied-runway and failed-landing go-arounds`, () => {
  const engine = engineFor({airport: airport.icao, weather: {...EXERCISE_WEATHER, windSpeed: 0}});
  for (const end of runwayEnds(airport)) {
    const g = engine.runwayGeometry(end.id), length = engine.distance(g.threshold, g.departure);
    const along = (p: {x: number; y: number}) => (p.x - g.threshold.x) * g.vector.x + (p.y - g.threshold.y) * g.vector.y;
    const point = (distance: number, lateral = 0) => ({x: g.threshold.x + g.vector.x * distance - g.vector.y * lateral, y: g.threshold.y + g.vector.y * distance + g.vector.x * lateral});
    const aircraft = (id: string, distance: number): Aircraft => ({...engine.newAircraft(id, true), runway: end.id, heading: g.heading, targetHeading: g.heading, position: point(distance)});
    for (const start of [.01, length * .4, length * .7]) for (const speed of [65, 135]) {
      const route = engine.runwayExitRoute({...aircraft("route", start), mode: "rollout", speed}, "any");
      if (!route.path) continue;
      for (let i = 2; i < route.path.length; i++) assert.ok(along(route.path[i]) >= along(route.path[i - 1]) - .00011, `${end.id}: exit cannot point backwards`);
    }
    const rollout = {...aircraft("rollout", .01), mode: "rollout" as const, performanceProfile: "C172" as const, landing: "full-stop" as const, altitude: airport.elevation, speed: 65, targetSpeed: 0};
    let state: Exercise = {...engine.initialExercise(), aircraft: [rollout], running: true};
    for (let t = 0; t < 600 && state.aircraft[0].mode !== "parked"; t++) {
      state = engine.advance(state, 1);
      const a = state.aircraft[0];
      if (a.mode === "rollout" && a.runwayExit) {
        const turn = runwayTurn(a, a.runwayExit);
        assert.ok(a.speed >= Math.min(15, turn.speed) - 1e-8, `${end.id}: keep moving toward the exit at a reachable turn speed`);
      }
      if (a.mode === "rollout") assert.ok(along(a.position) <= length + 1e-7, `${end.id}: rollout overrun`);
    }
    assert.equal(state.aircraft[0].mode, "parked", `${end.id}: must vacate or stop for instructions`);
    if (state.aircraft[0].holding) {
      const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
      assert.deepEqual(engine.advance(restored, 5).aircraft[0].position, state.aircraft[0].position);
    }
    const arrival = {...aircraft("arrival", -.6), altitude: airport.elevation + 50, clearedToLand: true};
    const blocker = {...aircraft("blocker", .2), mode: "parked" as const, altitude: airport.elevation, speed: 0};
    assert.ok(runwayOccupied(airport, end.id, [arrival, blocker], arrival.id));
    const occupied = engine.advance({...engine.initialExercise(), aircraft: [arrival, blocker], running: true}, .1).aircraft[0];
    assert.equal(occupied.mode, "go-around", `${end.id}: occupied runway requires GA without a configured conflict`);
    assert.equal(occupied.clearedToLand, false);
    const clear = {...blocker, position: point(.2, g.clearance + .02)};
    assert.equal(runwayOccupied(airport, end.id, [arrival, clear], arrival.id), false);
    const unstable = {...aircraft("unstable", -.002), position: point(-.002, .04), altitude: airport.elevation + 10, clearedToLand: true};
    const missed = engine.advance({...engine.initialExercise(), aircraft: [unstable], running: true}, .2).aircraft[0];
    assert.equal(missed.mode, "go-around", `${end.id}: a failed cleared landing must not silently change circuit leg`);
  }
});

test("runway geometry uses complete map centerlines; saved versions retain their original coordinates", () => {
  for (const airport of airportList) for (const pair of airportRunways(airport)) {
    const feet = Math.hypot(pair.ends[0].point.x - pair.ends[1].point.x, pair.ends[0].point.y - pair.ends[1].point.y) * 6076.12;
    assert.ok(Math.abs(feet / pair.lengthFeet! - 1) < .1, `${airport.icao} ${pair.id}: shortened centerline`);
  }
  for (const legacy of [kbhmLegacy, sbbrLegacy, rjttLegacy]) {
    const selection = {airport: legacy.icao, airportDataVersion: legacy.dataVersion};
    assert.deepEqual(getAirport(selection).runways, legacy.runways);
    assert.notEqual(getAirport({airport: legacy.icao}).dataVersion, legacy.dataVersion);
    const saved = engineFor(selection).initialExercise();
    assert.equal(restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(saved)))).airportDataVersion, legacy.dataVersion);
  }
});

test("runway braking reaches exit speed near the connector instead of crawling towards it", () => {
  const engine = engineFor({airport: "KDAL"}), airport = getAirport({airport: "KDAL"}), g = engine.runwayGeometry("31L");
  const a: Aircraft = {...engine.newAircraft("arrival", true), runway: "31L", mode: "rollout", landing: "full-stop", altitude: airport.elevation, speed: 100,
    position: {x: g.threshold.x + g.vector.x * .25, y: g.threshold.y + g.vector.y * .25}};
  let state: Exercise = {...engine.initialExercise(), aircraft: [a], running: true};
  for (let t = 0; t < 180 && state.aircraft[0].mode === "rollout"; t += .5) {
    state = engine.advance(state, .5);
    const a = state.aircraft[0];
    if (a.mode === "rollout" && a.runwayExit && a.speed <= runwayTurn(a, a.runwayExit).speed + 5)
      assert.ok(engine.distance(a.position, a.runwayExit[1]) < .05, "do not reach turn speed far before the exit");
  }
});

test("transferred radar arrivals also go missed for an occupied runway at every airport", () => {
  for (const airport of airportList) {
    const engine = engineFor({airport: airport.icao}), environment = radarEnvironmentFor(airport);
    for (const end of runwayEnds(airport)) {
      const g = engine.runwayGeometry(end.id), approach = environment.approaches.find(p => p.runway === end.id && p.type === "visual")!;
      const arrival: Aircraft = {...engine.newAircraft("arrival", true), runway: end.id, mode: "heading", frequency: "tower", altitude: airport.elevation + 50,
        position: {x: g.threshold.x - g.vector.x * .5, y: g.threshold.y - g.vector.y * .5}, heading: g.heading, targetHeading: g.heading,
        radar: {station: "approach", navigation: "approach", routeIndex: 0, cleared: approach.id, captured: true, transferred: true, clearanceAltitudeChecked: true}};
      const blocker: Aircraft = {...engine.newAircraft("blocker", false), runway: end.id, mode: "rollout", altitude: airport.elevation,
        position: {x: g.threshold.x + g.vector.x * .2, y: g.threshold.y + g.vector.y * .2}};
      moveRadar(arrival, .05, airport, environment, [arrival, blocker], false);
      assert.equal(arrival.radar!.navigation, "missed", `${airport.icao} ${end.id}`);
      assert.match(arrival.radar!.missedReason!, /occupied/);
    }
  }
});

for (const airport of airportList) test(`${airport.icao}: sequencing cannot drive an airliner below its speed envelope`, () => {
  const engine = engineFor({airport: airport.icao, weather: {...EXERCISE_WEATHER, windSpeed: 0}}), g = engine.runwayGeometry();
  const aircraft = [3, 5].map((d, i): Aircraft => ({...engine.newAircraft(i ? "follower" : "leader", true),
    position: {x: g.threshold.x - g.vector.x * d, y: g.threshold.y - g.vector.y * d}, altitude: airport.elevation + 800,
    speedMode: "manual", speed: i ? 220 : 160, targetSpeed: i ? 220 : 160, clearedToLand: true}));
  aircraft[1].sequence = {number: 2, followingId: "leader", runway: aircraft[1].runway!, circuit: 0, followingCircuit: 0};
  let state: Exercise = {...engine.initialExercise(), aircraft, running: true};
  for (let t = 0; t < 100; t++) {
    state = engine.advance(state, 1);
    const follower = state.aircraft.find(a => a.id === "follower")!;
    if (follower.mode === "pattern") assert.ok(follower.speed >= radarPerformance(follower).min - 1e-6);
  }
});
