import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {getAirport} from "./airports";
import {startConflict, prepareConflicts, conflictCommand, conflictLabels, aircraftCollisionGroups, type ConflictKind} from "./training-conflicts";
import {exerciseSchema, envelopeSchema, motionSchema, menteeActionAllowed} from "./protocol";
import {groundReady} from "./ground-ready";
import {createLocalAircraft, type LocalAircraftOptions} from "./local-aircraft";
import type {Aircraft, Instruction} from "./model";

function fixture(kind: ConflictKind = "uwc") {
  const selection = {airport: "KJFK"}, engine = engineFor(selection), airport = getAirport(selection);
  const state = engine.initialExercise(); state.running = true; state.autoReadback = true;
  const plane = (id: string, runway: string, nm: number) => {
    const a = engine.newAircraft(id, true), g = engine.runwayGeometry(runway);
    Object.assign(a, {callsign: `Test ${id}`, runway, mode: "pattern", leg: "final", landing: "touch-and-go", clearedToLand: true, clearedForOption: true, frequency: "tower", speed: 135, targetSpeed: 135, heading: g.heading, targetHeading: g.heading, altitude: airport.elevation + nm * 318, position: {x: g.threshold.x - g.vector.x * nm, y: g.threshold.y - g.vector.y * nm}});
    return a;
  };
  const a = plane("a", "22L", kind === "cancel-takeoff" ? 6 : 2);
  const b = plane("b", kind === "uwc" ? "22R" : "22L", kind === "uwc" ? 2 : 5);
  if (kind === "ga") {a.landing = "full-stop"; a.clearedForOption = false;}
  if (kind === "cancel-takeoff") Object.assign(b, {mode: "parked", altitude: airport.elevation, frequency: "ground", speed: 0, targetSpeed: 0, position: {...engine.runwayGeometry("22L").threshold}, groundReady: true});
  state.aircraft = [a, b];
  const support = {geometry: engine.runwayGeometry, distance: (p: Aircraft) => {
    const g = engine.runwayGeometry(p.runway!); return -(p.position.x - g.threshold.x) * g.vector.x - (p.position.y - g.threshold.y) * g.vector.y;
  }, instruct: (p: Aircraft, c: Instruction) => {
    if (c.type === "go-around") {p.mode = "go-around"; p.leg = "upwind";}
    if (c.type === "pattern") {p.leg = c.leg; p.extended = false;}
  }, lineupError: () => undefined};
  const start = () => startConflict(state, airport, support, "pair", kind, a.id, b.id);
  return {state, a, b, engine, airport, support, start};
}
test("UWC rejects non-TNG intentions, same runway, reciprocal runway, and self-pair atomically", () => {
  for (const change of [(h: ReturnType<typeof fixture>) => {h.a.landing = "full-stop";}, (h: ReturnType<typeof fixture>) => {h.b.runway = "22L";}, (h: ReturnType<typeof fixture>) => {h.b.runway = "04R";}]) {
    const h = fixture(); change(h); const before = structuredClone(h.state); assert.ok(h.start()); assert.deepEqual(h.state, before);
  }
  const h = fixture(); assert.match(startConflict(h.state, h.airport, h.support, "pair", "uwc", "a", "a")!, /different/);
});
test("UWC moves continuously after staging, waits for takeoff, and requests the other runway once", () => {
  const h = fixture(); h.b.position = {...h.a.position};
  assert.equal(h.start(), undefined); const positions = h.state.aircraft.map(a => ({...a.position})); prepareConflicts(h.state, h.airport, h.support);
  assert.deepEqual(h.state.aircraft.map(a => a.position), positions); assert.equal(h.a.conflictRequest, undefined);
  h.a.mode = "takeoff"; h.a.leg = "upwind"; h.b.mode = "takeoff"; h.b.leg = "upwind"; prepareConflicts(h.state, h.airport, h.support);
  assert.deepEqual(h.a.conflictRequest, {id: "runway-change", runway: "22R"}); assert.equal(h.a.runway, "22L");
  delete h.a.conflictRequest; prepareConflicts(h.state, h.airport, h.support); assert.equal(h.a.conflictRequest, undefined);
});
test("UWC holds both upwinds until the applied instruction and releases only the partner", () => {
  const h = fixture(); h.start(); h.state.conflicts![0].phase = "requested";
  h.a.leg = h.b.leg = "upwind"; prepareConflicts(h.state, h.airport, h.support);
  assert.ok(h.a.conflictMotion?.upwind && h.b.conflictMotion?.upwind);
  conflictCommand(h.state, "a", {type: "extend", leg: "upwind"}, h.support, false);
  assert.equal(h.state.conflicts![0].phase, "requested");
  h.a.extended = true; conflictCommand(h.state, "a", {type: "extend", leg: "upwind"}, h.support, true);
  assert.equal(h.b.leg, "crosswind"); assert.equal(h.a.extended, true); assert.equal(h.state.conflicts![0].phase, "complete");
});
test("Unable cancels UWC and releases both aircraft into their original circuits", () => {
  const h = fixture(); h.start(); h.state.conflicts![0].phase = "requested"; h.a.leg = h.b.leg = "upwind";
  conflictCommand(h.state, "a", {type: "radio", message: "unable"}, h.support, false);
  assert.equal(h.state.conflicts![0].phase, "cancelled"); assert.equal(h.a.runway, "22L"); assert.equal(h.b.runway, "22R"); assert.equal(h.a.leg, "crosswind"); assert.equal(h.b.leg, "crosswind");
});
test("GA validates leader order/full-stop runway and slows only the landed leader", () => {
  const h = fixture("ga"); h.a.landing = "touch-and-go"; assert.match(h.start()!, /full-stop/); h.a.landing = "full-stop";
  h.b.runway = "22R"; assert.match(h.start()!, /same runway/); h.b.runway = "22L"; assert.equal(h.start(), undefined);
  h.a.mode = "rollout"; h.a.altitude = h.airport.elevation; prepareConflicts(h.state, h.airport, h.support);
  assert.equal(h.a.conflictMotion?.slowExit, true); assert.equal(h.b.conflictMotion?.slowExit, undefined);
});
test("mentors can prepare GA before clearance or with option clearance and full-stop intentions", () => {
  for (const [clearedToLand, clearedForOption] of [[false, false], [true, false], [true, true]]) {
    const h = fixture("ga"); Object.assign(h.a, {clearedToLand, clearedForOption}); h.b.clearedToLand = false;
    const aircraft = structuredClone(h.state.aircraft), messages = structuredClone(h.state.messages);
    assert.equal(h.start(), undefined);
    assert.deepEqual(h.state.aircraft, aircraft, "pairing never grants or replaces a clearance");
    assert.deepEqual(h.state.messages, messages);
    assert.equal(h.state.conflicts![0].phase, "setup");
  }
});

test("mentors can prepare UWC with uncleared circuit traffic", () => {
  const h = fixture("uwc"); h.a.clearedToLand = false; h.b.clearedToLand = false;
  assert.equal(h.start(), undefined);
  assert.equal(h.a.clearedToLand, false); assert.equal(h.b.clearedToLand, false);
});
test("GA extends the following downwind to obtain three-mile spacing", () => {
  const h = fixture("ga"); h.start(); h.b.position = {...h.a.position}; h.b.leg = "downwind";
  prepareConflicts(h.state, h.airport, h.support); assert.equal(h.b.conflictMotion?.extendDownwind, true); assert.equal(h.a.conflictMotion?.extendDownwind, undefined);
});
test("cancel takeoff rejects airborne targets, prior departure requests, missing routes and late arrivals", () => {
  const h = fixture("cancel-takeoff"); h.b.altitude += 100; assert.match(h.start()!, /ground/); h.b.altitude = h.airport.elevation;
  h.state.messages.push({id: "prior", aircraftId: "b", sender: "pilot", time: 0, text: "departure", frequency: "tower", request: {id: "departure", runway: "22L"}, requestCircuit: 0});
  assert.match(h.start()!, /already requested/); h.state.messages = [];
  assert.match(startConflict(h.state, h.airport, {...h.support, lineupError: () => "No route"}, "pair", "cancel-takeoff", "a", "b")!, /No route/);
  const g = h.support.geometry("22L"); h.a.position = {x: g.threshold.x - g.vector.x * 4, y: g.threshold.y - g.vector.y * 4}; assert.match(h.start()!, /inside 5/);
});
test("departure request fires once at 5.5 NM and never creates takeoff authority", () => {
  const h = fixture("cancel-takeoff"); h.start(); prepareConflicts(h.state, h.airport, h.support); assert.equal(h.b.conflictRequest, undefined);
  const g = h.support.geometry("22L"); h.a.position = {x: g.threshold.x - g.vector.x * 5.4, y: g.threshold.y - g.vector.y * 5.4};
  prepareConflicts(h.state, h.airport, h.support); assert.equal(h.b.conflictRequest?.id, "departure"); assert.equal(h.b.mode, "parked");
  delete h.b.conflictRequest; prepareConflicts(h.state, h.airport, h.support); assert.equal(h.b.conflictRequest, undefined); assert.equal(h.state.conflicts![0].takeoffCleared, undefined);
});
test("lineup without takeoff clearance never departs and withholding lineup cancels at touchdown", () => {
  const h = fixture("cancel-takeoff"); h.start(); conflictCommand(h.state, "b", {type: "lineup"}, h.support, true);
  prepareConflicts(h.state, h.airport, h.support); assert.equal(h.state.conflicts![0].takeoffCleared, undefined);
  const untouched = fixture("cancel-takeoff"); untouched.start(); untouched.a.mode = "rollout"; prepareConflicts(untouched.state, untouched.airport, untouched.support); assert.equal(untouched.state.conflicts![0].phase, "cancelled");
});
test("takeoff clearance gets a bounded delay and cancellation/go-around resolve the pair", () => {
  const h = fixture("cancel-takeoff"); h.start(); conflictCommand(h.state, "b", {type: "takeoff"}, h.support, true);
  prepareConflicts(h.state, h.airport, h.support); assert.equal(h.b.conflictMotion?.holdDeparture, true);
  h.state.elapsed = 76; prepareConflicts(h.state, h.airport, h.support); assert.equal(h.b.conflictMotion?.holdDeparture, undefined);
  conflictCommand(h.state, "a", {type: "go-around"}, h.support, true); conflictCommand(h.state, "b", {type: "atc", action: "cancel-takeoff"}, h.support, true);
  prepareConflicts(h.state, h.airport, h.support); assert.equal(h.state.conflicts![0].phase, "complete"); assert.equal(h.b.conflictMotion?.holdDeparture, undefined);
});
test("self go-around is announced once, and a missed cancellation does not force a separated collision", () => {
  const h = fixture("cancel-takeoff"); h.start(); conflictCommand(h.state, "b", {type: "takeoff"}, h.support, true);
  const g = h.support.geometry("22L"); h.a.position = {x: g.threshold.x - g.vector.x * .6, y: g.threshold.y - g.vector.y * .6};
  h.a.altitude = h.airport.elevation + 50;
  prepareConflicts(h.state, h.airport, h.support); assert.equal(h.a.mode, "go-around"); assert.equal(h.a.selfGoAroundPending, true);
  assert.equal(h.state.conflicts![0].phase, "complete"); assert.equal(conflictLabels(h.state.conflicts, "a"), ""); assert.equal(conflictLabels(h.state.conflicts, "b"), "");
  assert.equal(h.b.conflictMotion, undefined);
  delete h.a.selfGoAroundPending; prepareConflicts(h.state, h.airport, h.support); assert.equal(h.a.selfGoAroundPending, undefined);
  h.a.altitude = h.airport.elevation + 1000; h.a.position.x += 10; prepareConflicts(h.state, h.airport, h.support);
  assert.match(h.state.conflicts![0].outcome!, /cancellation missed/); assert.deepEqual(aircraftCollisionGroups(h.state.aircraft, h.airport.elevation), []);
});

test("cancel takeoff and GA use the same 50-foot or threshold self-go-around point", () => {
  for (const [nm, height, expected] of [[.6, 191, false], [.1, 51, false], [.1, 50, true], [.1, 49, true], [0, 100, true], [-.01, 100, true]] as const) {
    for (const kind of ["ga", "cancel-takeoff"] as const) {
      const h = fixture(kind); h.start(); const arrival = kind === "ga" ? h.b : h.a, g = h.support.geometry("22L");
      if (kind === "ga") {h.a.mode = "rollout"; h.a.position = {...g.threshold}; h.a.altitude = h.airport.elevation;}
      else conflictCommand(h.state, "b", {type: "lineup"}, h.support, true);
      arrival.position = {x: g.threshold.x - g.vector.x * nm, y: g.threshold.y - g.vector.y * nm}; arrival.altitude = h.airport.elevation + height;
      prepareConflicts(h.state, h.airport, h.support);
      assert.equal(arrival.mode === "go-around", expected, `${kind}: ${nm} NM, ${height} ft`);
      assert.equal(!!arrival.selfGoAroundPending, expected);
      if (kind === "cancel-takeoff") for (const a of h.state.aircraft) assert.equal(conflictLabels(h.state.conflicts, a.id), expected ? "" : "Cancel Takeoff");
    }
  }
});

test("applied takeoff cancellation clears both conflict labels without requiring a go-around", () => {
  for (const goAround of [false, true]) {
    const h = fixture("cancel-takeoff"); h.start(); conflictCommand(h.state, "b", {type: "takeoff"}, h.support, true);
    prepareConflicts(h.state, h.airport, h.support); assert.equal(h.b.conflictMotion?.holdDeparture, true);
    if (goAround) conflictCommand(h.state, "a", {type: "go-around"}, h.support, true);
    const cancel: Instruction = {type: "atc", action: "cancel-takeoff"};
    conflictCommand(h.state, "b", cancel, h.support, false);
    assert.equal(conflictLabels(h.state.conflicts, "b"), "Cancel Takeoff", "sending alone does not assign the instruction");
    conflictCommand(h.state, "b", cancel, h.support, true);
    assert.equal(h.state.conflicts![0].phase, "complete"); assert.equal(h.state.conflicts![0].cancelledTakeoff, true);
    assert.equal(h.b.conflictMotion, undefined);
    for (const a of h.state.aircraft) assert.equal(conflictLabels(h.state.conflicts, a.id), "");
    const g = h.support.geometry("22L"); h.a.position = {...g.threshold};
    prepareConflicts(h.state, h.airport, h.support); assert.equal(h.a.selfGoAroundPending, undefined, "a completed conflict cannot trigger a later go-around");
  }
});

test("ordinary safety go-arounds and restored resolved pairs clear cancel-takeoff labels", () => {
  for (const takeoffCleared of [true, false]) {
    const h = fixture("cancel-takeoff"); h.start(); h.state.conflicts![0].phase = "requested";
    if (takeoffCleared) conflictCommand(h.state, "b", {type: "takeoff"}, h.support, true);
    h.a.mode = "go-around"; h.a.leg = "upwind";
    prepareConflicts(h.state, h.airport, h.support);
    assert.equal(h.state.conflicts![0].phase, "complete"); assert.match(h.state.conflicts![0].outcome!, takeoffCleared ? /cancellation missed/ : /departure remained held/);
    for (const a of h.state.aircraft) assert.equal(conflictLabels(h.state.conflicts, a.id), "");
  }
  const restored = fixture("cancel-takeoff"); restored.start(); restored.state.conflicts![0].cancelledTakeoff = true;
  prepareConflicts(restored.state, restored.airport, restored.support);
  assert.equal(restored.state.conflicts![0].phase, "complete"); assert.equal(conflictLabels(restored.state.conflicts, "a"), "");
});

test("completed cancel-takeoff failures still announce one go-around through the real radio path", () => {
  for (const autoReadback of [true, false]) {
    const h = fixture("cancel-takeoff"); h.state.autoReadback = autoReadback; h.start();
    conflictCommand(h.state, "b", {type: "takeoff"}, h.support, true);
    const g = h.support.geometry("22L"); h.a.position = {x: g.threshold.x - g.vector.x * .1, y: g.threshold.y - g.vector.y * .1}; h.a.altitude = h.airport.elevation + 49;
    let state = h.engine.advance(h.state, .1), id = 0;
    assert.equal(state.aircraft[0].mode, "go-around"); assert.equal(state.aircraft[1].mode, "parked");
    assert.equal(state.conflicts![0].phase, "complete");
    for (const a of state.aircraft) assert.equal(conflictLabels(state.conflicts, a.id), "");
    state = h.engine.autoReadbacks(state, 1000, () => `call-${++id}`);
    state = h.engine.advance(state, 1); state = h.engine.autoReadbacks(state, 2000, () => `call-${++id}`);
    assert.equal(state.messages.filter(m => m.aircraftId === "a" && m.sender === "pilot" && m.text === "Test a, going around").length, 1);
    assert.equal(exerciseSchema.parse(state).conflicts![0].phase, "complete");
  }
});

test("real cancellation readback clears the conflict immediately in automatic and manual mode", () => {
  for (const autoReadback of [true, false]) {
    const h = fixture("cancel-takeoff"); h.state.autoReadback = autoReadback; h.start(); h.b.frequency = "tower";
    conflictCommand(h.state, "b", {type: "takeoff"}, h.support, true);
    const result = h.engine.applyEnvelope(h.state, {id: "cancel", time: 1000, action: {kind: "command", aircraftId: "b", frequency: "tower", text: "Test b, cancel takeoff clearance, hold position", command: {type: "atc", action: "cancel-takeoff"}}});
    assert.equal(result.error, undefined);
    assert.equal(conflictLabels(result.state.conflicts, "b"), "Cancel Takeoff");
    const response = autoReadback ? {state: h.engine.autoReadbacks(h.engine.advance(result.state, 2), 100000, () => "readback")} : h.engine.applyEnvelope(result.state, {id: "readback", time: 100000, action: {kind: "pilot", aircraftId: "b", text: "Wilco, Test b", replyTo: "cancel", assign: true}});
    assert.equal("error" in response ? response.error : undefined, undefined);
    assert.equal(response.state.conflicts![0].cancelledTakeoff, true);
    assert.equal(response.state.conflicts![0].phase, "complete");
    assert.equal(response.state.aircraft[1].holding, true);
    for (const a of response.state.aircraft) assert.equal(conflictLabels(response.state.conflicts, a.id), "");
  }
});
test("physical contact merges groups, excludes separated traffic and covers ground/airborne", () => {
  const h = fixture("ga"); h.b.position = {...h.a.position}; h.b.altitude = h.a.altitude;
  assert.equal(aircraftCollisionGroups(h.state.aircraft, h.airport.elevation).length, 1);
  h.b.altitude += 100; assert.equal(aircraftCollisionGroups(h.state.aircraft, h.airport.elevation).length, 0);
  h.a.altitude = h.b.altitude = h.airport.elevation; assert.equal(aircraftCollisionGroups(h.state.aircraft, h.airport.elevation).length, 1);
});
test("conflict tags combine active types and exclude completed/cancelled pairs", () => {
  const h = fixture("ga"); h.start(); const c = h.state.conflicts![0]; h.state.conflicts!.push({...c, id: "other", kind: "cancel-takeoff"});
  assert.equal(conflictLabels(h.state.conflicts, "a"), "GA + Cancel Takeoff"); c.phase = "cancelled"; assert.equal(conflictLabels(h.state.conflicts, "a"), "Cancel Takeoff");
});
test("paired actions are staff-only, snapshot and motion schemas retain state, pause is immutable", () => {
  const h = fixture(); const envelope = {id: "start", time: 1, action: {kind: "conflict" as const, conflict: "uwc" as const, aircraftId: "a", otherId: "b"}};
  assert.equal(menteeActionAllowed(envelopeSchema.parse(envelope).action, h.state), false);
  const result = h.engine.applyEnvelope(h.state, envelope); assert.equal(result.error, undefined);
  assert.equal(exerciseSchema.parse(result.state).conflicts?.length, 1); assert.equal(motionSchema.parse(result.state).conflicts?.length, 1);
  const paused = {...result.state, running: false}; assert.equal(h.engine.advance(paused, 2), paused);
  const removed = h.engine.applyEnvelope(result.state, {id: "delete", time: 2, action: {kind: "remove", aircraftId: "b"}}).state;
  assert.equal(removed.conflicts![0].phase, "cancelled", "removal cancels even while motion is stopped");
  const resumed = h.engine.advance(removed, .1); assert.equal(resumed.conflicts![0].phase, "cancelled");
});
test("authoritative UWC holds both upwinds without mutating the input snapshot", () => {
  const h = fixture(); h.start(); const c = h.state.conflicts![0]; c.phase = "requested";
  for (const a of h.state.aircraft) {const g = h.engine.runwayGeometry(a.runway!); a.leg = "upwind"; a.position = {x: g.departure.x + 2 * g.vector.x, y: g.departure.y + 2 * g.vector.y}; a.altitude = h.airport.elevation + 1500;}
  const before = structuredClone(h.state); const next = h.engine.advance(h.state, 5);
  assert.deepEqual(h.state, before); assert.ok(next.aircraft.every(a => a.leg === "upwind"));
});
test("authoritative Radar contact crash removes aircraft once and survives recovery schemas", () => {
  const engine = engineFor({trainingStation: "EGPH:approach"}), state = engine.initialExercise();
  state.running = true; const a = state.aircraft[0];
  state.aircraft = [a, {...structuredClone(a), id: "other", callsign: "Test other"}];
  const next = engine.advance(state, .1); assert.equal(next.aircraft.length, 0); assert.equal(next.collisions?.length, 1);
  assert.equal(exerciseSchema.parse(next).collisions?.length, 1); assert.equal(motionSchema.parse(next).collisions?.length, 1);
  assert.equal(engine.advance(next, 1).collisions?.length, 1);
});
test("custom ground spawn retains exact scope coordinates and uses taxi controls", () => {
  const h = fixture(), position = {x: 1.25, y: -2.75};
  const options: LocalAircraftOptions = {placement: "ground", position, callsign: "Test 42", type: "A320", runway: "22L", distance: 5, leg: "final", hand: "left", height: 1500, speed: 160, heading: 220, landing: "full-stop", flight: "departure", frequency: "ground"};
  const a = createLocalAircraft(h.state, "new", options); assert.deepEqual(a.position, position); assert.equal(a.altitude, h.airport.elevation); assert.equal(a.speed, 0); assert.equal(groundReady(a, h.airport), true);
});


test("live conflict requests survive the real radio path once, including manual automatic mode", () => {
  for (const autoReadback of [true, false]) {
    const h = fixture("cancel-takeoff"); h.state.autoReadback = autoReadback;
    const result = h.engine.applyEnvelope(h.state, {id: "start-real", time: 1, action: {kind: "conflict", conflict: "cancel-takeoff", aircraftId: "a", otherId: "b"}});
    assert.equal(result.error, undefined);
    let state = result.state;
    for (let i = 0; i < 40; i++) state = h.engine.advance(state, 1);
    let id = 0; state = h.engine.autoReadbacks(state, 1000, () => `radio-${++id}`);
    assert.equal(state.messages.filter(m => m.aircraftId === "b" && m.request?.id === "departure").length, 1);
    state = h.engine.autoReadbacks(state, 1001, () => `radio-${++id}`);
    assert.equal(state.messages.filter(m => m.aircraftId === "b" && m.request?.id === "departure").length, 1);
    assert.equal(state.aircraft.find(a => a.id === "b")!.mode, "parked");
  }
});
test("real UWC flight and radio timing reaches takeoff, keeps both extending and accepts pattern entry", () => {
  const h = fixture(); const ga = h.engine.runwayGeometry("22L"), gb = h.engine.runwayGeometry("22R");
  h.b.position = {x: gb.threshold.x - gb.vector.x * 2, y: gb.threshold.y - gb.vector.y * 2}; h.b.altitude = h.a.altitude;
  let state = h.engine.applyEnvelope(h.state, {id: "uwc-real", time: 1, action: {kind: "conflict", conflict: "uwc", aircraftId: "a", otherId: "b"}}).state;
  let id = 0;
  for (let i = 0; i < 150 && state.conflicts![0].phase !== "requested"; i++) {state = h.engine.advance(state, 1); state = h.engine.autoReadbacks(state, i * 1000, () => `uwc-radio-${++id}`);}
  assert.equal(state.conflicts![0].phase, "requested");
  assert.equal(state.messages.filter(m => m.request?.id === "runway-change").length, 1);
  state = h.engine.advance(state, 90); // advance is intentionally capped to five seconds
  assert.equal(state.conflicts![0].phase, "requested");
  const result = h.engine.applyEnvelope(state, {id: "entry", time: 200000, action: {kind: "maneuver", aircraftId: "a", command: {type: "pattern", leg: "downwind", runway: "22R", hand: "right"}}});
  assert.equal(result.error, undefined); assert.equal(result.state.conflicts![0].phase, "complete"); assert.equal(result.state.aircraft.find(a => a.id === "b")!.leg, "crosswind");
  assert.ok(ga.heading > 0);
});


test("GA schedules both wide and close final gaps without repositioning", () => {
  const h = fixture("ga"), g = h.support.geometry(h.b.runway!);
  h.b.position = {x: g.threshold.x - g.vector.x * 5.5, y: g.threshold.y - g.vector.y * 5.5};
  const before = structuredClone(h.state.aircraft); assert.equal(h.start(), undefined);
  assert.deepEqual(h.state.aircraft, before); assert.ok(h.support.distance(h.b) - h.support.distance(h.a) > 3);
  const close = fixture("ga"); close.b.position = {x: g.threshold.x - g.vector.x * 3, y: g.threshold.y - g.vector.y * 3};
  const unchanged = structuredClone(close.state.aircraft); assert.equal(close.start(), undefined); assert.deepEqual(close.state.aircraft, unchanged);
});
test("UWC preserves aircraft positions while accepting different initial altitudes", () => {
  const h = fixture(), g = h.support.geometry(h.b.runway!);
  h.b.position = {x: g.threshold.x - g.vector.x * 2.1, y: g.threshold.y - g.vector.y * 2.1};
  const before = structuredClone(h.state.aircraft); assert.equal(h.start(), undefined); assert.deepEqual(h.state.aircraft, before);
  const unsuitable = fixture(); unsuitable.b.altitude += 1000; const unchanged = structuredClone(unsuitable.state.aircraft);
  assert.equal(unsuitable.start(), undefined); assert.deepEqual(unsuitable.state.aircraft, unchanged);
});


test("a go-around is not a touch-and-go takeoff or a touchdown", () => {
  const u = fixture(); u.start(); u.a.mode = "go-around"; u.a.leg = "upwind"; u.a.circuit = 1;
  prepareConflicts(u.state, u.airport, u.support); assert.equal(u.state.conflicts![0].phase, "setup"); assert.equal(u.a.conflictRequest, undefined);
  const c = fixture("cancel-takeoff"); c.start(); c.a.mode = "go-around"; c.a.leg = "upwind"; c.a.circuit = 1;
  prepareConflicts(c.state, c.airport, c.support); assert.equal(c.state.conflicts![0].phase, "setup");
});


test("a transmitted go-around suppresses self-calling while its readback is pending", () => {
  const h = fixture("cancel-takeoff"); h.start(); conflictCommand(h.state, "b", {type: "lineup"}, h.support, true);
  const g = h.support.geometry(h.a.runway!); h.a.position = {x: g.threshold.x - g.vector.x * .6, y: g.threshold.y - g.vector.y * .6};
  h.a.altitude = h.airport.elevation + 50;
  conflictCommand(h.state, "a", {type: "go-around"}, h.support, false); prepareConflicts(h.state, h.airport, h.support);
  assert.equal(h.a.mode, "pattern", "the pending readback still controls motion"); assert.equal(h.a.selfGoAroundPending, undefined);
});


test("valid cross-kind exercises can overlap and display combined labels", () => {
  const h = fixture();
  for (const a of [h.a, h.b]) {const g = h.support.geometry(a.runway!); a.position = {x: g.threshold.x - g.vector.x * 4, y: g.threshold.y - g.vector.y * 4};}
  assert.equal(h.start(), undefined);
  const leader = {...h.a, id: "third", callsign: "Test third", landing: "full-stop" as const, clearedForOption: false, position: {...h.a.position}};
  const g = h.support.geometry(leader.runway!); leader.position = {x: g.threshold.x - g.vector.x * .5, y: g.threshold.y - g.vector.y * .5};
  h.state.aircraft.push(leader);
  assert.equal(startConflict(h.state, h.airport, h.support, "ga-pair", "ga", "third", "a"), undefined);
  assert.equal(conflictLabels(h.state.conflicts, "a"), "UWC + GA");
});
