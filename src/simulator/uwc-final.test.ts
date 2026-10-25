import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {getAirport} from "./airports";
import {acceleration} from "./aircraft-performance";
import {EXERCISE_WEATHER, type Aircraft} from "./model";
import {exerciseSchema, motionSchema} from "./protocol";
import {applyReplayDelta, replayDelta} from "./replays";
import {prepareConflicts} from "./training-conflicts";

function pair(airport = "KDAL", runways = ["31L", "31R"], gap = .08, speeds = [135, 155], wind = 0, nm = 3) {
  const weather = {...EXERCISE_WEATHER, windDirection: 270, windSpeed: wind, temperature: 28, qnh: 1021};
  const engine = engineFor({airport, weather}), elevation = getAirport({airport}).elevation;
  const state = engine.initialExercise(); state.running = true; state.autoReadback = true; state.messages = [];
  state.aircraft = runways.map((runway, i) => {
    const g = engine.runwayGeometry(runway), distance = nm + (i ? gap : 0);
    return {...engine.newAircraft(i ? "b" : "a", true), runway, mode: "pattern", leg: "final", landing: "touch-and-go", frequency: "tower",
      clearedToLand: true, clearedForOption: true, heading: g.heading, targetHeading: g.heading, bankAngle: 0,
      altitude: elevation + distance * 318, position: {x: g.threshold.x - g.vector.x * distance, y: g.threshold.y - g.vector.y * distance},
      speed: speeds[i], targetSpeed: speeds[i]} as Aircraft;
  });
  const result = engine.applyEnvelope(state, {id: "uwc", time: 1, action: {kind: "conflict", conflict: "uwc", aircraftId: "a", otherId: "b"}});
  assert.equal(result.error, undefined); assert.deepEqual(result.state.aircraft, state.aircraft, "pairing never teleports or changes speeds");
  const distance = (a: Aircraft) => {
    const g = engine.runwayGeometry(a.runway!);
    return -(a.position.x - g.threshold.x) * g.vector.x - (a.position.y - g.threshold.y) * g.vector.y;
  };
  return {engine, state: result.state, distance};
}

test("UWC keeps finals within 0.1 NM and touches and goes together on both KDAL directions and staggered JFK parallels", () => {
  for (const [airport, runways] of [["KDAL", ["31L", "31R"]], ["KDAL", ["13R", "13L"]], ["KJFK", ["22L", "22R"]], ["KJFK", ["04R", "04L"]]] as const) {
    for (const [gap, speeds, wind] of [[.08, [135, 155], 0], [-.08, [155, 135], 12], [.04, [155, 135], 18]] as const) {
      const h = pair(airport, [...runways], gap, [...speeds], wind); let state = h.state, paced = false;
      const touchdown = new Map<string, number>(), takeoff = new Map<string, number>();
      for (let i = 0; i < 800 && (takeoff.size < 2 || state.conflicts![0].phase !== "requested"); i++) {
        const previous = state; state = h.engine.advance(state, .25);
        for (const a of state.aircraft) {
          const before = previous.aircraft.find(p => p.id === a.id)!;
          assert.ok(Math.abs(a.speed - before.speed) <= acceleration(a) * .25 + 1e-7, "speed changes use normal acceleration");
          assert.ok(Math.hypot(a.position.x - before.position.x, a.position.y - before.position.y) < .025, "continuous motion");
          if (a.conflictMotion?.speedTarget !== undefined) {paced = true; assert.ok(a.conflictMotion.speedTarget >= 135 && a.conflictMotion.speedTarget <= 165);}
          if ((a.circuit ?? 0) > (before.circuit ?? 0)) touchdown.set(a.id, state.elapsed);
          if (a.mode === "takeoff" && !takeoff.has(a.id)) takeoff.set(a.id, state.elapsed);
          assert.notEqual(a.mode, "go-around");
        }
        if (state.aircraft.every(a => a.mode === "pattern" && a.leg === "final")) {
          const gap = Math.abs(h.distance(state.aircraft[0]) - h.distance(state.aircraft[1]));
          assert.ok(gap <= .1, `${airport} ${runways} final gap ${gap}`);
        }
      }
      assert.ok(paced); assert.equal(touchdown.size, 2); assert.equal(takeoff.size, 2);
      assert.ok(Math.abs(touchdown.get("a")! - touchdown.get("b")!) <= 1, "touchdowns within one second");
      assert.ok(Math.abs(takeoff.get("a")! - takeoff.get("b")!) <= 1, "touch-and-go transitions within one second");
      assert.equal(state.conflicts![0].phase, "requested");
      assert.ok(state.aircraft.every(a => a.conflictMotion?.speedTarget === undefined), "no final pacing during takeoff/upwind");
    }
  }
});

test("UWC closes an existing larger gap on a long final without changing assigned speed settings", () => {
  const h = pair("KDAL", ["31L", "31R"], .5, [150, 180], 8, 5); let state = h.state;
  state.aircraft.forEach(a => {a.speedMode = "manual"; a.speedTargets = {vref: 140};});
  let captured = false;
  for (let i = 0; i < 800 && state.aircraft.every(a => a.mode === "pattern"); i++) {
    state = h.engine.advance(state, .25);
    const gap = Math.abs(h.distance(state.aircraft[0]) - h.distance(state.aircraft[1]));
    if (gap <= .1) captured = true;
    if (captured) assert.ok(gap <= .1);
    for (const a of state.aircraft.filter(a => a.mode === "pattern")) assert.equal(a.targetSpeed, a.id === "a" ? 150 : 180);
    assert.ok(state.aircraft.every(a => a.speedTargets?.vref === 140));
  }
  assert.ok(captured); assert.ok(Math.min(...state.aircraft.map(h.distance)) < .05);
});

test("UWC acquires matching finals continuously after the natural base turns", () => {
  const h = pair(); let state = h.state;
  for (const a of state.aircraft) {
    const p = h.engine.patternTargets(a), g = h.engine.runwayGeometry(a.runway!);
    a.leg = "base"; a.position = {x: (p.downwind.x + p.base.x) / 2, y: (p.downwind.y + p.base.y) / 2};
    if (a.id === "b") {a.position.x -= g.vector.x * .08; a.position.y -= g.vector.y * .08;}
    a.heading = a.targetHeading = h.engine.bearing(p.downwind, p.base); a.speed = a.targetSpeed = 180;
    a.altitude = getAirport({airport: "KDAL"}).elevation + 1500;
  }
  const touchdown = new Map<string, number>(); let finals = false;
  for (let i = 0; i < 1000 && touchdown.size < 2; i++) {
    const before = state; state = h.engine.advance(state, .25);
    finals ||= state.aircraft.every(a => a.leg === "final" && a.conflictMotion?.speedTarget !== undefined);
    if (finals && state.aircraft.every(a => a.mode === "pattern")) assert.ok(Math.abs(h.distance(state.aircraft[0]) - h.distance(state.aircraft[1])) <= .1);
    for (const a of state.aircraft) if ((a.circuit ?? 0) > (before.aircraft.find(p => p.id === a.id)!.circuit ?? 0)) touchdown.set(a.id, state.elapsed);
  }
  assert.ok(finals); assert.equal(touchdown.size, 2);
  assert.ok(Math.abs(touchdown.get("a")! - touchdown.get("b")!) <= 1);
});

test("UWC staging uses the tighter 0.1 NM downwind threshold", () => {
  for (const gap of [.1, .15]) {
    const h = pair(); h.state.aircraft[0].leg = "downwind";
    prepareConflicts(h.state, getAirport({airport: "KDAL"}), {geometry: h.engine.runwayGeometry,
      distance: a => a.id === "a" ? 5 : 5 + gap, instruct: () => {}, lineupError: () => undefined});
    assert.equal(!!h.state.aircraft[0].conflictMotion?.extendDownwind, gap > .1);
  }
});

test("UWC contains a closing-speed mismatch on short final before it can exceed 0.1 NM", () => {
  const h = pair("KDAL", ["31L", "31R"], .06, [165, 135], 0, 1); let state = h.state;
  const touchdown = new Map<string, number>();
  for (let i = 0; i < 200 && touchdown.size < 2; i++) {
    const previous = state; state = h.engine.advance(state, .25);
    if (state.aircraft.every(a => a.mode === "pattern")) assert.ok(Math.abs(h.distance(state.aircraft[0]) - h.distance(state.aircraft[1])) <= .1);
    for (const a of state.aircraft) if ((a.circuit ?? 0) > (previous.aircraft.find(p => p.id === a.id)!.circuit ?? 0)) touchdown.set(a.id, state.elapsed);
  }
  assert.equal(touchdown.size, 2); assert.ok(Math.abs(touchdown.get("a")! - touchdown.get("b")!) <= 1);
});

test("UWC guidance survives snapshots/replay and cancellation restores the assigned speed", () => {
  const h = pair(); let state = h.state;
  state.aircraft.forEach(a => {a.speedMode = "manual"; a.targetSpeed = 160;});
  const previous = state; state = h.engine.advance(state, 1);
  assert.ok(state.aircraft.some(a => a.conflictMotion?.speedTarget !== undefined));
  const recovered = exerciseSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(recovered.aircraft.map(a => a.conflictMotion), state.aircraft.map(a => a.conflictMotion));
  assert.deepEqual(motionSchema.parse(state).aircraft.map(a => a.conflictMotion), state.aircraft.map(a => a.conflictMotion));
  assert.deepEqual(JSON.parse(JSON.stringify(applyReplayDelta(previous, replayDelta(previous, state)))), JSON.parse(JSON.stringify(state)));
  assert.deepEqual(h.engine.advance(recovered, 1).aircraft.map(a => a.position), h.engine.advance(state, 1).aircraft.map(a => a.position));
  const predicted = h.engine.predictAircraft(state.aircraft, .05), advanced = h.engine.advance(state, .05);
  predicted.forEach((a, i) => assert.ok(Math.hypot(a.position.x - advanced.aircraft[i].position.x, a.position.y - advanced.aircraft[i].position.y) < .0001));
  const cancelled = h.engine.applyEnvelope(state, {id: "cancel", time: 2, action: {kind: "cancel-conflict", conflictId: "uwc"}});
  assert.equal(cancelled.error, undefined); assert.ok(cancelled.state.aircraft.every(a => !a.conflictMotion));
  state = h.engine.advance(cancelled.state, 20);
  assert.ok(state.aircraft.every(a => a.targetSpeed === 160 && a.speed > 140));
});

test("UWC does not force incompatible aircraft below landing speed or pace go-arounds", () => {
  const h = pair(); h.state.aircraft[0].performanceProfile = "C172"; h.state.aircraft[1].performanceProfile = "B738";
  let state = h.engine.advance(h.state, 1);
  assert.ok(state.aircraft.every(a => a.conflictMotion?.speedTarget === undefined));
  state = pair().state; state.aircraft[1].mode = "go-around"; state.aircraft[1].leg = "upwind";
  state = h.engine.advance(state, 1);
  assert.ok(state.aircraft.every(a => a.conflictMotion?.speedTarget === undefined));
});
