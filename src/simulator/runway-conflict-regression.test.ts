import assert from "node:assert/strict";
import test from "node:test";
import {airportList, getAirport, runwayEnds} from "./airports";
import {createAirportEngine, engineFor} from "./engine";
import {EXERCISE_WEATHER, type Aircraft, type Airport, type Exercise} from "./model";
import {exerciseSchema} from "./protocol";
import {moveRadar, radarEnvironmentFor} from "./radar";
import {prepareConflicts} from "./training-conflicts";

function kdal() {
  const airport = getAirport({airport: "KDAL"});
  const engine = engineFor({airport: "KDAL", weather: {...EXERCISE_WEATHER, windSpeed: 0}});
  const g = engine.runwayGeometry("31R");
  const point = (along: number, lateral = 0) => ({x: g.threshold.x + g.vector.x * along - g.vector.y * lateral, y: g.threshold.y + g.vector.y * along + g.vector.x * lateral});
  const along = (a: Aircraft) => (a.position.x - g.threshold.x) * g.vector.x + (a.position.y - g.threshold.y) * g.vector.y;
  const leader: Aircraft = {...engine.newAircraft("leader", false), callsign: "N714KG", runway: "31R", mode: "rollout", landing: "full-stop", frequency: "tower",
    position: point(.47), altitude: airport.elevation, speed: 90, targetSpeed: 0, heading: g.heading, targetHeading: g.heading};
  const follower: Aircraft = {...engine.newAircraft("follower", true), callsign: "American 2154", runway: "31R", frequency: "tower", leg: "final", landing: "full-stop",
    position: point(-.648), altitude: airport.elevation + 208, speed: 135, targetSpeed: 135, heading: g.heading, targetHeading: g.heading, clearedToLand: true};
  const state: Exercise = {...engine.initialExercise(), running: true, autoReadback: true, aircraft: [leader, follower], conflicts: [
    {id: "ga", kind: "ga", first: leader.id, second: follower.id, runway: "31R", otherRunway: "31R", phase: "active", circuit: 0, started: 0, rollAt: 0},
  ]};
  return {airport, engine, g, point, along, leader, follower, state};
}

test("recorded KDAL 31R left exit accepts M5 at rolling and stopped speeds without a backward path", () => {
  const {engine, g, leader, point} = kdal();
  for (const speed of [0, 15, 85, 90, 135]) {
    const a = {...leader, position: point(.5093605245833268), speed}, route = engine.runwayExitRoute(a, "left");
    assert.equal(route.error, undefined);
    const entry = route.path![1], entryAlong = (entry.x - g.threshold.x) * g.vector.x + (entry.y - g.threshold.y) * g.vector.y;
    if (speed <= 90) assert.ok(Math.abs(entryAlong - .9890891902396232) < .001, "reachable M5 connector");
    for (let i = 2; i < route.path!.length; i++) {
      const p = route.path![i], previous = route.path![i - 1];
      assert.ok((p.x - previous.x) * g.vector.x + (p.y - previous.y) * g.vector.y >= -1e-12);
    }
    assert.equal(engine.validateAssignment(a, {type: "exit-runway", side: "left"}), null);
  }
});

test("mapping skew is bounded cumulatively and real backward exits stay unavailable", () => {
  const {airport} = kdal();
  for (const drift of [.0002, .002]) {
    const runway = {id: "18/36", lengthFeet: 6076, ends: [{id: "36", heading: 0, point: {x: 0, y: 0}}, {id: "18", heading: 180, point: {x: 0, y: 1}}], widthFeet: 150};
    const mapped: Airport = {...airport, runway, runways: [runway], features: [{id: "exit", kind: "taxiway", name: "A", points: [
      {x: 0, y: .4}, {x: -.02, y: .4 - drift}, {x: -.04, y: .4 - drift * 2}, {x: -.08, y: .4 - drift * 3},
    ]}]};
    const engine = createAirportEngine(mapped), a = {...engine.newAircraft("a", false), runway: "36", position: {x: 0, y: .1}, speed: 15};
    // Individual small steps must not accumulate into an unbounded backward route.
    assert.ok(engine.runwayExitRoute(a, "left").error);
    mapped.features[0].points = [{x: 0, y: .4}, {x: -.04, y: .4 - drift}, {x: -.08, y: .4 - drift}];
    const route = engine.runwayExitRoute(a, "left");
    if (drift < .001) {assert.equal(route.error, undefined); assert.ok(route.path!.every(p => p.y >= .4 - 1e-12 || p === route.path![0]));}
    else assert.ok(route.error);
  }
});

test("paired GA and recorded KDAL exit keep the leader rolling at least 15 kt until its exit", () => {
  for (const explicitExit of [false, true]) {
    const {airport, engine, along, state: initial} = kdal();
    let state = initial, id = 0, wentAround = false, reachedExit = false;
    if (explicitExit) {
      const result = engine.applyEnvelope(state, {id: "exit", time: 0, action: {kind: "command", aircraftId: "leader", frequency: "tower", text: "", command: {type: "exit-runway", side: "left"}}});
      assert.equal(result.error, undefined); state = result.state;
    }
    for (let t = 0; t < 180; t += .05) {
      const before = state.aircraft.find(a => a.id === "follower")!;
      const previousLeader = state.aircraft.find(a => a.id === "leader")!;
      state = engine.advance(state, .05);
      state = engine.autoReadbacks(state, t * 1000, () => `radio-${++id}`);
      const leader = state.aircraft.find(a => a.id === "leader")!, follower = state.aircraft.find(a => a.id === "follower")!;
      if (leader.mode === "rollout") {
        assert.ok(leader.speed >= 15 - 1e-8, `${leader.speed} kt on the runway`);
        assert.ok(along(leader) > along(previousLeader), "leader keeps moving");
      }
      if (!wentAround && follower.mode === "go-around") {
        assert.ok(before.altitude <= airport.elevation + 50 + 1e-8 || along(follower) >= 0, "no early go-around");
        wentAround = true;
      }
      if (t > 5 && t < 5.1) state = engine.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
      if (leader.mode === "taxi") {reachedExit = true; break;}
    }
    assert.equal(wentAround, true); assert.equal(reachedExit, true);
    assert.equal(state.messages.filter(m => m.text === "American 2154, going around").length, 1);
    assert.equal(state.messages.some(m => /^Unable/.test(m.text)), false);
    if (explicitExit) assert.ok(state.messages.some(m => m.commandId === "exit" && /^Wilco/.test(m.text)));
  }
});

test("GA conflict respects exact height/threshold boundaries and a leader already clear", () => {
  for (const [height, along, clear, expected] of [[208, -.648, false, false], [50.01, -.1, false, false], [50, -.1, false, true], [49, -.1, false, true], [200, .001, false, true], [50, -.1, true, false]] as const) {
    const h = kdal(); h.follower.altitude = h.airport.elevation + height; h.follower.position = h.point(along);
    if (clear) h.leader.position = h.point(.5, h.g.clearance + .01);
    prepareConflicts(h.state, h.airport, {geometry: h.engine.runwayGeometry, distance: a => Math.max(0, -h.along(a)), lineupError: () => undefined,
      instruct: a => {a.mode = "go-around"; a.leg = "upwind";}});
    assert.equal(h.follower.mode === "go-around", expected);
    assert.equal(h.leader.conflictMotion?.holdRunway, undefined);
  }
});

test("old stopped GA snapshots resume toward an exit, while explicit controller holds remain stopped", () => {
  const {engine, point, state: initial} = kdal();
  initial.aircraft[0].position = point(.844); initial.aircraft[0].speed = 0;
  initial.aircraft[0].conflictMotion = {slowExit: true, holdRunway: true};
  initial.aircraft[1].position = point(-5); initial.aircraft[1].altitude += 1000;
  for (const hold of [false, true]) {
    let state = engine.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(initial))));
    if (hold) {
      const result = engine.applyEnvelope(state, {id: "hold", time: 0, action: {kind: "maneuver", aircraftId: "leader", command: {type: "stop"}}});
      assert.equal(result.error, undefined); state = result.state;
    }
    const start = state.aircraft[0].position;
    for (let t = 0; t < 6; t++) state = engine.advance(state, 1);
    if (hold) assert.equal(state.aircraft[0].speed, 0);
    else assert.ok(state.aircraft[0].speed >= 5);
    if (hold) assert.deepEqual(state.aircraft[0].position, start);
    else assert.ok(engine.distance(state.aircraft[0].position, start) > .001);
  }
});

for (const airport of airportList) test(`${airport.icao}: local and transferred arrivals wait for 50 ft AAL or the threshold`, () => {
  const engine = engineFor({airport: airport.icao, weather: {...EXERCISE_WEATHER, windSpeed: 0}}), environment = radarEnvironmentFor(airport);
  for (const end of runwayEnds(airport)) for (const radar of [false, true]) for (const [height, along, expected] of [[208, -.6, false], [51, -.1, false], [50, -.1, true], [200, .001, true]] as const) {
    const g = engine.runwayGeometry(end.id), point = (n: number) => ({x: g.threshold.x + g.vector.x * n, y: g.threshold.y + g.vector.y * n});
    const a: Aircraft = {...engine.newAircraft("arrival", true), runway: end.id, leg: "final", frequency: "tower", position: point(along), altitude: airport.elevation + height,
      heading: g.heading, targetHeading: g.heading, clearedToLand: true};
    const blocker: Aircraft = {...engine.newAircraft("blocker", false), runway: end.id, position: point(engine.distance(g.threshold, g.departure) / 2), altitude: airport.elevation, mode: "parked", holding: true};
    if (radar) {
      const approach = environment.approaches.find(p => p.runway === end.id && p.type === "visual")!;
      a.mode = "heading"; a.radar = {station: "approach", navigation: "approach", routeIndex: 0, cleared: approach.id, captured: true, transferred: true, clearanceAltitudeChecked: true};
      moveRadar(a, .00001, airport, environment, [a, blocker], false);
      assert.equal(a.radar.navigation === "missed", expected, `${end.id} radar ${height} ft / ${along} NM`);
    } else {
      const next = engine.advance({...engine.initialExercise(), running: true, aircraft: [a, blocker]}, .00001);
      assert.equal(next.aircraft[0].mode === "go-around", expected, `${end.id} local ${height} ft / ${along} NM`);
    }
  }
});
