import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor, restoreExercise} from "./engine";
import {getAirport} from "./airports";
import {approachGeometry, assignRadar, moveRadar, radarGuidanceLabel} from "./radar";
import {gpsApproachJoin, gpsFinalApproachFix} from "./gps-approach";
import {trueToMagnetic} from "./magnetic-headings";
import {exerciseSchema} from "./protocol";
import {ReplayTimeline, replayDelta} from "./replays";
import type {Instruction} from "./model";

function fixture(station: "approach" | "center" = "approach") {
  const engine = engineFor({airport: "EGPH", trainingStation: `EGPH:${station}`}), state = engine.initialExercise();
  state.running = true; state.autoReadback = true;
  const airport = getAirport(state), env = state.radarEnvironment!, a = state.aircraft[0];
  const p = env.approaches.find(p => p.id === "gps-24")!, g = approachGeometry(airport, p.runway);
  const point = (nm: number, side = 0) => ({x: g.threshold.x - g.vector.x * nm - g.vector.y * side, y: g.threshold.y - g.vector.y * nm + g.vector.x * side});
  Object.assign(a, {position: point(12), heading: g.heading, targetHeading: g.heading, altitude: 2500, speed: 180, targetSpeed: 180, speedMode: "manual"});
  a.flightPlan = [{...point(15), name: "ENTRY"}, {...point(10), name: "IF"}, {...point(5), name: "FAF", finalApproachFix: true}, {...g.threshold, name: "RW24"}];
  Object.assign(a.radar!, {routeIndex: 1, navigation: "route"}); delete a.radar!.report;
  assignRadar(a, {type: "expect-approach", approachId: p.id, navigation: "filed"}, airport, env);
  const command = (extra: Partial<Extract<Instruction, {type: "vector"}>> = {}): Extract<Instruction, {type: "vector"}> => ({type: "vector", approachId: p.id, ...extra});
  const clear = (extra = {}) => {
    const c = command(extra); assert.equal(engine.validateAssignment(a, c), null);
    assignRadar(a, c, airport, env);
  };
  const fly = (seconds: number, automatic = true) => {for (let t = 0; t < seconds; t += .1) moveRadar(a, .1, airport, env, [], automatic);};
  return {engine, state, airport, env, a, p, g, point, command, clear, fly};
}

for (const station of ["approach", "center"] as const) {
  for (const variant of ["filed", "on-route", "altitude", "drag-vector"] as const) test(`${station}: GPS ${variant} follows the plan and establishes at the FAF`, () => {
    const f = fixture(station);
    if (variant === "altitude" || variant === "drag-vector") {
      f.a.position = f.point(12, 1); f.a.radar!.navigation = "heading";
    }
    f.clear(variant === "altitude" ? {altitude: {unit: "feet", value: 2000}} : variant === "drag-vector" ? {heading: trueToMagnetic(f.g.heading + 30, f.airport), altitude: {unit: "feet", value: 2000}} : {});
    assert.equal(f.a.radar!.captured, false);
    f.fly(55);
    assert.equal(f.a.radar!.navigation, "approach");
    assert.equal(f.a.radar!.gpsApproach!.joined, true);
    assert.equal(f.a.radar!.captured, false, "must follow the plan before the FAF rather than capture final early");
    assert.match(radarGuidanceLabel(f.a, f.env)!, /Following flight plan/);
    f.fly(110);
    assert.equal(f.a.radar!.captured, true, JSON.stringify({radar: f.a.radar, altitude:f.a.altitude, position:f.a.position}));
    assert.equal(f.a.radar!.navigation, "approach");
    assert.ok(f.a.altitude < 2000);
  });
  test(`${station}: continue as filed alone grants no approach clearance and misses at the FAF`, () => {
    const f = fixture(station); f.fly(155);
    assert.equal(f.a.radar!.navigation, "missed");
    assert.match(f.a.radar!.missedReason!, /without a GPS approach clearance/);
    assert.equal(f.a.radar!.captured, false);
  });
}

for (const scenario of ["at-faf", "past-faf", "far-off-route", "wrong-way-vector", "steep-vector", "reversal", "empty-plan", "wrong-runway", "passed-index"] as const) test(`GPS rejects ${scenario} without changing the aircraft`, () => {
  const f = fixture(); let heading: number | undefined;
  if (scenario === "at-faf") f.a.position = f.point(5);
  if (scenario === "past-faf") f.a.position = f.point(4);
  if (scenario === "far-off-route") f.a.position = f.point(12, 5);
  if (scenario === "wrong-way-vector" || scenario === "steep-vector") {f.a.position = f.point(12, 1); heading = trueToMagnetic(f.g.heading + (scenario === "steep-vector" ? 70 : -30), f.airport);}
  if (scenario === "reversal") f.a.heading = f.a.targetHeading = (f.g.heading + 180) % 360;
  if (scenario === "empty-plan") f.a.flightPlan = [];
  if (scenario === "wrong-runway") f.a.flightPlan[2] = {...f.point(5, 3), finalApproachFix: true};
  if (scenario === "passed-index") f.a.radar!.routeIndex = 3;
  const before = structuredClone(f.a), result = f.engine.applyEnvelope(f.state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: f.a.id, command: f.command({heading})}});
  assert.ok(result.error); assert.deepEqual(f.a, before);
});

test("GPS joins a dogleg flight plan without skipping its intermediate waypoints", () => {
  const f = fixture();
  f.a.flightPlan = [{...f.point(20, 4)}, {...f.point(14, 4)}, {...f.point(9)}, {...f.point(5), finalApproachFix: true}, {...f.g.threshold}];
  f.a.position = f.point(18, 4); f.a.radar!.routeIndex = 1;
  f.clear(); f.fly(70);
  assert.equal(f.a.radar!.captured, false); assert.ok(f.a.radar!.routeIndex <= 2);
  f.fly(260);
  assert.equal(f.a.radar!.captured, true, JSON.stringify({radar: f.a.radar, altitude:f.a.altitude, position:f.a.position})); assert.equal(f.a.radar!.navigation, "approach");
});

test("the recorded Southwest 9529 clearance follows its active leg to CI24", () => {
  const f = fixture();
  f.a.flightPlan = [{x: 18.581250390672295, y: 25.609399799999863, name: "MT26"},
    {x: 8.194825888668653, y: 4.875866399999893, name: "CI24"},
    {x: 3.911473881931576, y: 2.325283200000001, name: "FI24"},
    {x: .5784562171984023, y: .34451044921880225, name: "RW24"}];
  Object.assign(f.a, {position: {x: 16.454987962702674, y: 15.726135468188257}, heading: 216.638707548576, targetHeading: 216.638707548576, altitude: 4000, speed: 250, targetSpeed: 250});
  Object.assign(f.a.radar!, {navigation: "route", routeIndex: 1, expected: "gps-24", targetAltitude: {unit: "feet", value: 4000}});
  f.clear(); assert.equal(f.a.radar!.gpsApproach?.index, 1);
  f.fly(120); assert.equal(f.a.radar!.navigation, "approach"); assert.equal(f.a.radar!.routeIndex, 1);
  for (let i = 0; i < 300 && !f.a.radar!.captured && f.a.radar!.navigation === "approach"; i++) f.fly(1);
  assert.equal(f.a.radar!.navigation, "approach", f.a.radar!.missedReason); assert.equal(f.a.radar!.captured, true);
});

test("GPS clearance preserves an accepted continue-as-filed intercept until it joins the route", () => {
  const f = fixture();
  Object.assign(f.a, {position: f.point(19, 3), heading: (f.g.heading + 30) % 360, targetHeading: (f.g.heading + 30) % 360});
  Object.assign(f.a.radar!, {navigation: "heading", routeIndex: 1});
  const filed: Instruction = {type: "atc", action: "navigation", variant: "filed"};
  const assigned = f.engine.applyEnvelope(f.state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: f.a.id, command: filed}});
  assert.equal(assigned.error, undefined); assert.ok(assigned.state.aircraft[0].radar!.filedJoin);
  const cleared = f.engine.applyEnvelope(assigned.state, {id: randomUUID(), time: 1, action: {kind: "maneuver", aircraftId: f.a.id, command: f.command()}});
  assert.equal(cleared.error, undefined); assert.ok(cleared.state.aircraft[0].radar!.filedJoin);
  const before = JSON.stringify(cleared.state);
  f.engine.predictAircraft(cleared.state.aircraft, 1); f.engine.projectedPath(cleared.state.aircraft[0], 60);
  assert.equal(JSON.stringify(cleared.state), before);
  const vertical = f.engine.applyEnvelope(cleared.state, {id: randomUUID(), time: 1, action: {kind: "maneuver", aircraftId: f.a.id, command: {type: "vector", altitude: {unit: "feet", value: 2000}}}});
  assert.ok(vertical.state.aircraft[0].radar!.filedJoin); assert.ok(vertical.state.aircraft[0].radar!.gpsApproach);
  const vectored = f.engine.applyEnvelope(vertical.state, {id: randomUUID(), time: 1, action: {kind: "maneuver", aircraftId: f.a.id, command: {type: "vector", heading: 90}}});
  assert.equal(vectored.state.aircraft[0].radar!.filedJoin, undefined); assert.equal(vectored.state.aircraft[0].radar!.gpsApproach, undefined);
  let state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(cleared.state))));
  const heading = state.aircraft[0].heading; state = f.engine.advance(state, 10);
  assert.ok(Math.abs(state.aircraft[0].heading - heading) < 1);
  let joined = false;
  for (let i = 0; i < 600 && !state.aircraft[0].radar!.captured; i++) {
    state = f.engine.advance(state, 1);
    const radar = state.aircraft[0].radar!;
    if (!radar.filedJoin && radar.gpsApproach?.joined) joined = true;
    assert.equal(radar.navigation, "approach", radar.missedReason);
  }
  assert.ok(joined); assert.equal(state.aircraft[0].radar!.captured, true);
});

test("GPS clearance rejects a pending filed intercept too close to the final approach fix", () => {
  const f = fixture(); f.a.position = f.point(7, 1); f.a.radar!.routeIndex = 2;
  f.a.radar!.filedJoin = {index: 2, point: f.point(5.2), heading: f.g.heading, turning: false};
  assert.match(f.engine.validateAssignment(f.a, f.command())!, /before the final approach fix/);
});

test("an earlier filed procedure leg abeam the runway is still before the FAF", () => {
  const f = fixture();
  f.a.flightPlan = [f.point(3, 4), f.point(15, 4), f.point(9), {...f.point(5), finalApproachFix: true}, {...f.g.threshold}];
  f.a.position = f.point(4, 4); f.a.heading = f.a.targetHeading = (f.g.heading + 180) % 360;
  f.a.radar!.routeIndex = 1;
  f.clear(); f.fly(5);
  assert.equal(f.a.radar!.navigation, "approach"); assert.equal(f.a.radar!.captured, false);
});

test("late parallel and shallow vectors cannot rejoin before the FAF", () => {
  const f = fixture(); f.a.position = f.point(5.5, 1); f.a.radar!.routeIndex = 2;
  for (const heading of [undefined, f.g.heading, f.g.heading + 30]) assert.ok(gpsApproachJoin(f.a, f.p, f.g, heading).error);
});

test("changing the flight plan cancels its GPS clearance", () => {
  const f = fixture(); f.clear();
  const result = f.engine.applyEnvelope(f.state, {id: randomUUID(), time: 0, action: {kind: "edit", aircraftId: f.a.id, patch: {flightPlan: []}}});
  assert.equal(result.error, undefined); assert.equal(result.state.aircraft[0].radar!.gpsApproach, undefined);
  assert.equal(result.state.aircraft[0].radar!.cleared, undefined);
});

test("GPS clearance is rechecked when the delayed pilot readback crosses the FAF", () => {
  const f = fixture(); f.a.position = f.point(5.02); f.a.radar!.routeIndex = 2;
  const sent = f.engine.applyEnvelope(f.state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: f.a.id, frequency: "approach", text: "", command: f.command()}});
  assert.equal(sent.error, undefined, "controllers can transmit a late instruction");
  const advanced = f.engine.advance(sent.state, 2);
  const result = f.engine.autoReadbacks(advanced, 2000, randomUUID);
  assert.match(result.messages.at(-1)!.text, /Unable/);
  assert.match(result.messages.at(-1)!.unableReason!, /before the final approach fix/);
  assert.equal(result.aircraft[0].radar!.cleared, undefined);
});

test("GPS route guidance survives reload/replay and prediction never mutates the live join", () => {
  const f = fixture(); f.a.position = f.point(12, 1); f.a.radar!.navigation = "heading"; f.clear();
  const before = structuredClone(f.state), restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(f.state))));
  f.engine.advance(f.state, 30); assert.deepEqual(f.state, before);
  f.fly(160);
  for (let t = 0; t < 160; t += .1) moveRadar(restored.aircraft[0], .1, f.airport, f.env, [], true);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.aircraft[0])), JSON.parse(JSON.stringify(f.a)));
  const replay = new ReplayTimeline(before, [{sequence: 1, at: 160, delta: replayDelta(before, f.state), interpolate: false}]);
  assert.deepEqual(replay.at(160).aircraft[0].radar, f.a.radar);
});

test("GPS altitude-only instructions preserve the route clearance; a new vector cancels it", () => {
  const f = fixture(); f.clear();
  assignRadar(f.a, {type: "vector", altitude: {unit: "feet", value: 2000}}, f.airport, f.env);
  assert.ok(f.a.radar!.gpsApproach);
  assignRadar(f.a, {type: "vector", heading: 90}, f.airport, f.env);
  assert.equal(f.a.radar!.gpsApproach, undefined); assert.equal(f.a.radar!.cleared, undefined);
});

test("FAF markers override the schematic fallback and inconsistent final geometry is rejected", () => {
  const f = fixture(); assert.equal(gpsFinalApproachFix(f.a, f.p, f.g), 2);
  delete f.a.flightPlan[2].finalApproachFix; assert.equal(gpsFinalApproachFix(f.a, f.p, f.g), 2);
  f.a.flightPlan[2].finalApproachFix = true; f.a.flightPlan[1].finalApproachFix = true;
  assert.ok(gpsApproachJoin(f.a, f.p, f.g).error);
  delete f.a.flightPlan[1].finalApproachFix; f.a.flightPlan[3] = f.point(2, 3);
  assert.ok(gpsApproachJoin(f.a, f.p, f.g).error);
});
