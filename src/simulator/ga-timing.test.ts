import assert from "node:assert/strict";
import test from "node:test";
import {engineFor, createAirportEngine} from "./engine";
import {getAirport, airportList, airportRunways, runwayEnds} from "./airports";
import {DEFAULTS, type Aircraft, EXERCISE_WEATHER, type Airport, type Exercise} from "./model";
import {exerciseSchema, motionSchema} from "./protocol";
import {runwayOccupied} from "./runway-safety";
import {applyReplayDelta, replayDelta} from "./replays";
import {moveRadar, radarEnvironmentFor} from "./radar";
import {prepareConflicts} from "./training-conflicts";
import {runwayTurn} from "./ground-movement";

// Physical state at the reported KDAL pairing, with session/account/radio data removed.
function reportedPair() {
  const engine = engineFor({airport: "KDAL", weather: {windDirection: 150, windSpeed: 8, variableWind: false, visibilityKm: 16.09344, qnh: 1021.8, temperature: 28.3, dewpoint: 10.6, reference: "Recorded KDAL wind"}});
  const state = engine.initialExercise();
  state.elapsed = 453.045; state.running = true; state.autoReadback = true;
  const common = {mode: "pattern", leg: "final", runway: "31R", frequency: "tower", hand: "right", clearedToLand: true, clearedForOption: true, optionHand: "right"} as const;
  const leader: Aircraft = {...engine.newAircraft("leader", true), ...common, callsign: "N714KG", type: "A21N", landing: "full-stop",
    position: {x: 1.8474817853880996, y: -1.6246038486986436}, altitude: 1135.0230669029245, speed: 160, targetSpeed: 160,
    heading: 315.1462739491035, targetHeading: 315.1462739536123, bankAngle: .0006802908182137321, groundSpeed: 173.47807683110577, patternFinalDistance: 12.316734559065361};
  const follower: Aircraft = {...engine.newAircraft("follower", true), ...common, callsign: "American 2154", type: "B38M", landing: "touch-and-go",
    position: {x: 5.001141534807459, y: -3.7033551725754332}, altitude: 1987, speed: 154.7625081867645, targetSpeed: 180,
    heading: 245.89204062441854, targetHeading: 270.958553795389, bankAngle: 25, groundSpeed: 163.37340180138574, patternFinalDistance: 6.237418746377713,
    sequence: {number: 2, traffic: "Final", followingId: "leader", runway: "31R", circuit: 0, followingCircuit: 0}};
  state.aircraft = [leader, follower]; state.messages = [];
  const result = engine.applyEnvelope(state, {id: "ga", time: 1, action: {kind: "conflict", conflict: "ga", aircraftId: leader.id, otherId: follower.id}});
  assert.equal(result.error, undefined);
  assert.deepEqual(result.state.aircraft, state.aircraft, "pairing never repositions traffic or grants a clearance");
  return {engine, state: result.state, airport: getAirport(state)};
}

test("reported KDAL pair stays occupied for one 50-foot go-around, then vacates continuously", () => {
  const h = reportedPair(); let state = h.state, wentAround = false, paced = false, readbacks = 0;
  for (let i = 0; i < 3300; i++) {
    const previous = state, a = previous.aircraft[0], b = previous.aircraft[1];
    state = h.engine.advance(previous, .05);
    const next = state.aircraft[0], following = state.aircraft[1];
    if (a.mode === "taxi" && next.mode === "taxi") {
      assert.ok(Math.abs(next.speed - a.speed) <= DEFAULTS.acceleration * .05 + 1e-7, "vacating speed changes gradually");
      assert.ok(Math.hypot(next.position.x - a.position.x, next.position.y - a.position.y) <= Math.max(a.speed, next.speed) / 3600 * .05 + 1e-7, "no ground teleport");
      if (!wentAround) assert.ok(next.speed > 0, "the exercise never holds the leader stationary");
    }
    if (next.conflictMotion?.speedLimit !== undefined) {
      paced = true; assert.ok(next.conflictMotion.speedLimit >= 5);
      assert.equal(exerciseSchema.parse(state).aircraft[0].conflictMotion?.speedLimit, next.conflictMotion.speedLimit);
      assert.equal(motionSchema.parse(state).aircraft[0].conflictMotion?.speedLimit, next.conflictMotion.speedLimit);
    }
    if (b.mode !== "go-around" && following.mode === "go-around") {
      wentAround = true;
      assert.ok(b.altitude <= h.airport.elevation + 52, "no early automatic go-around");
      assert.ok(runwayOccupied(h.airport, "31R", [a], b.id));
      assert.equal(state.conflicts![0].phase, "complete");
      assert.match(state.conflicts![0].outcome!, /Following aircraft went around/);
      assert.equal(next.conflictMotion, undefined, "normal exit speed resumes immediately");
      const recovered = exerciseSchema.parse(JSON.parse(JSON.stringify(state)));
      assert.equal(recovered.conflicts![0].selfGoAround, true);
      assert.equal(motionSchema.parse(state).aircraft[1].mode, "go-around");
      assert.deepEqual(JSON.parse(JSON.stringify(applyReplayDelta(previous, replayDelta(previous, state)))), JSON.parse(JSON.stringify(state)));
    }
    state = h.engine.autoReadbacks(state, i * 50, () => `radio-${++readbacks}`);
  }
  assert.ok(paced); assert.ok(wentAround, "American 2154 must go around before touching down");
  assert.equal(state.messages.filter(m => m.aircraftId === "follower" && /going around/i.test(m.text)).length, 1);
  assert.equal(state.aircraft[1].circuit, 1);
  assert.equal(state.aircraft[0].mode, "parked");
  assert.equal(runwayOccupied(h.airport, "31R", state.aircraft, "follower"), false);
  assert.equal(state.aircraft[0].conflictMotion, undefined);
});

test("cancelling GA during rollout immediately restores ordinary exit motion", () => {
  const h = reportedPair(); let state = h.state;
  for (let i = 0; i < 120 && state.aircraft[0].conflictMotion?.speedLimit === undefined; i++) state = h.engine.advance(state, 1);
  assert.ok(state.aircraft[0].conflictMotion?.speedLimit);
  assert.equal(state.aircraft[0].mode, "rollout");
  const cancelled = h.engine.applyEnvelope(state, {id: "cancel", time: 2, action: {kind: "cancel-conflict", conflictId: "ga"}});
  assert.equal(cancelled.error, undefined); state = cancelled.state;
  assert.equal(state.conflicts![0].phase, "cancelled");
  assert.equal(state.aircraft[0].conflictMotion, undefined);
  for (let i = 0; i < 120; i++) state = h.engine.advance(state, 1);
  assert.equal(state.aircraft[0].mode, "parked");
  assert.notEqual(state.aircraft[1].mode, "go-around");
});

test("an unachievable distant arrival reports that GA did not materialise", () => {
  const h = reportedPair(); let state = h.state;
  const g = h.engine.runwayGeometry("31R"), b = state.aircraft[1];
  b.position = {x: g.threshold.x - g.vector.x * 20, y: g.threshold.y - g.vector.y * 20};
  b.heading = b.targetHeading = g.heading; b.bankAngle = 0; b.altitude = h.airport.elevation + 1500;
  delete b.sequence;
  for (let i = 0; i < 300 && state.conflicts![0].phase !== "cancelled"; i++) state = h.engine.advance(state, 1);
  assert.equal(state.conflicts![0].phase, "cancelled");
  assert.match(state.conflicts![0].outcome!, /did not materialise/);
  assert.equal(state.aircraft[0].conflictMotion, undefined);
  assert.notEqual(state.aircraft[1].mode, "go-around");
});

test("a controller's explicit exit instruction retains its ordinary vacating speed", () => {
  const h = reportedPair(); let state = h.state;
  for (let i = 0; i < 65; i++) state = h.engine.advance(state, 1);
  const instructed = h.engine.applyEnvelope(state, {id: "exit", time: 2, action: {kind: "maneuver", aircraftId: "leader", command: {type: "exit-runway", side: "left", expedite: true}}});
  assert.equal(instructed.error, undefined); state = instructed.state;
  assert.equal(state.aircraft[0].arrivalExit!.instruction, "exit-runway");
  state = h.engine.advance(state, .1);
  assert.equal(state.aircraft[0].conflictMotion?.speedLimit, undefined);
});

test("GA slows during rollout and keeps the runway occupied across wider final gaps", () => {
  for (const finalDistance of [1, 2, 3, 4]) for (const step of [.05, 1, 5]) {
    const h = reportedPair(), g = h.engine.runwayGeometry("31R");
    let state = h.state, wentAround = false, slowRollout = false;
    const [a, b] = state.aircraft;
    a.mode = "rollout"; a.position = {...g.threshold}; a.altitude = h.airport.elevation; a.speed = 90;
    a.heading = a.targetHeading = g.heading;
    b.position = {x: g.threshold.x - g.vector.x * finalDistance, y: g.threshold.y - g.vector.y * finalDistance};
    b.heading = b.targetHeading = g.heading; b.bankAngle = 0; b.altitude = h.airport.elevation + finalDistance * 318;
    b.speed = b.targetSpeed = 135; delete b.sequence;
    const firstExit = h.engine.runwayExitRoute(a, "any").path![1];
    for (let seconds = 0; seconds < 200; seconds += step) {
      const previous = state.aircraft[0];
      state = h.engine.advance(state, step);
      const [leader, follower] = state.aircraft;
      if (leader.mode === "rollout" && !wentAround && state.conflicts![0].phase === "active") {
        assert.ok(leader.speed > 0, "never stops the leader to manufacture occupancy");
        assert.ok(Math.abs(leader.speed - previous.speed) <= DEFAULTS.acceleration * step + 1e-7, "rollout brakes gradually");
        if (leader.speed < 70) slowRollout = true;
        if (seconds >= 25) assert.ok(leader.speed <= 15 + 1e-7, `${finalDistance} NM: still rolling at ${leader.speed} kt`);
      }
      if (!wentAround && follower.mode === "go-around") {
        wentAround = true;
        assert.ok(runwayOccupied(h.airport, "31R", [leader], follower.id), `${finalDistance} NM: leader cleared too soon`);
      }
      if (seconds > 10 && seconds <= 10 + step) state = h.engine.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
      if (leader.mode === "parked") break;
    }
    assert.ok(slowRollout, `${finalDistance} NM: pacing must start before turning off`);
    assert.ok(wentAround, `${finalDistance} NM / ${step}s: the intended GA must happen`);
    assert.equal(state.conflicts![0].phase, "complete");
    assert.equal(state.aircraft[0].mode, "parked");
    assert.deepEqual(state.aircraft[0].taxiPath[1], firstExit, "can use the first reachable exit, rather than always skipping it");
  }
});

test("GA can be scheduled on every supported runway, including KDAL 31R", () => {
  for (const airport of airportList) {
    const e = engineFor({airport: airport.icao});
    for (const pair of airportRunways(airport)) for (const end of pair.ends) {
      const g = e.runwayGeometry(end.id), s = e.initialExercise();
      s.aircraft = ["a", "b"].map((id, i) => ({...e.newAircraft(id, true), runway: end.id, leg: "final", mode: "pattern", frequency: "tower", landing: "full-stop", speed: 135, targetSpeed: 135, altitude: airport.elevation + (i ? 5.5 : 2) * 318, heading: g.heading, position: {x: g.threshold.x - g.vector.x * (i ? 5.5 : 2), y: g.threshold.y - g.vector.y * (i ? 5.5 : 2)}}));
      const result = e.applyEnvelope(s, {id: "ga", time: 1, action: {kind: "conflict", conflict: "ga", aircraftId: "a", otherId: "b"}});
      assert.equal(result.error, undefined, `${airport.icao} ${end.id}`);
    }
  }
});

test("KDAL GA exercises keep the leader moving and finish when it clears or the follower goes around", () => {
  const airport = getAirport({airport: "KDAL"}), e = engineFor({airport: "KDAL"});
  for (const pair of airportRunways(airport)) for (const end of pair.ends) {
    const g = e.runwayGeometry(end.id); let state = e.initialExercise(); state.running = true;
    state.aircraft = ["a", "b"].map((id, i) => ({...e.newAircraft(id, true), runway: end.id, mode: "pattern", leg: "final", frequency: "tower", landing: "full-stop", clearedToLand: true, speed: 135, targetSpeed: 135, altitude: airport.elevation + (i ? 5.5 : 2) * 318, heading: g.heading, targetHeading: g.heading, position: {x: g.threshold.x - g.vector.x * (i ? 5.5 : 2), y: g.threshold.y - g.vector.y * (i ? 5.5 : 2)}}));
    state = e.applyEnvelope(state, {id: "ga", time: 1, action: {kind: "conflict", conflict: "ga", aircraftId: "a", otherId: "b"}}).state;
    for (let i = 0; i < 500 && state.conflicts![0].phase !== "complete"; i++) {
      state = e.advance(state, 1);
      const leader = state.aircraft[0];
      if (leader.mode === "rollout" && leader.runwayExit) assert.ok(leader.speed >= 5 - 1e-8, `${end.id}: GA must not stop the leader`);
    }
    assert.equal(state.conflicts![0].phase, "complete", end.id);
    assert.ok(["Following aircraft went around", "Runway conflict ended"].includes(state.conflicts![0].outcome!), end.id); assert.equal(state.collisions?.length ?? 0, 0);
    assert.equal(state.aircraft[0].conflictMotion, undefined, "the leader is released after the exercise");
  }
});

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

test("paired GA and recorded KDAL exit keep rolling and brake for the final turn", () => {
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
        const turn = runwayTurn(leader, leader.runwayExit!);
        assert.ok(leader.speed >= Math.min(15, turn.speed) - 1e-8, `${leader.speed} kt on the runway`);
        if (leader.speed < 15 - 1e-8) assert.ok(engine.distance(leader.position, turn.position) < .02, "slow below 15 kt only just before the tight exit turn");
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
