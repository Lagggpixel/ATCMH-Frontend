import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {engineFor} from "./engine";
import {buildGroundRoute} from "./ground-route";
import {envelopeSchema, exerciseSchema, motionSchema} from "./protocol";
import {applyReplayDelta, replayDelta} from "./replays";
import {acceleration, rotationSpeed} from "./aircraft-performance";
import {buildTaxiGraph} from "./taxi-routing";
import type {Aircraft, Exercise, Instruction} from "./model";

const airport = getAirport({airport: "KDAL"}), engine = engineFor({airport: "KDAL"});
const runway = "31L", geometry = engine.runwayGeometry(runway);
const along = (point: {x: number; y: number}) => (point.x - geometry.threshold.x) * geometry.vector.x + (point.y - geometry.threshold.y) * geometry.vector.y;
const length = along(geometry.departure);
const graph = buildTaxiGraph(airport);
// Real C5 entry on the terminal side of 31L, as in the reported departure.
const c5 = graph.points.find(p => Math.abs(along(p) - .6862639241797948) < 1e-7)!;
const initial = (profile?: Aircraft["performanceProfile"]): Exercise => {
  const a = {...engine.newAircraft("delta", false), performanceProfile: profile, callsign: "Delta 64", runway, frequency: "tower" as const,
    position: {...c5}, heading: (geometry.heading + 270) % 360, targetHeading: (geometry.heading + 270) % 360,
    speed: 0, targetSpeed: 0, mode: "parked" as const, taxiPath: [{...c5, runway}], taxiIndex: 1};
  return {...engine.initialExercise(), running: true, autoReadback: true, aircraft: [a]};
};
let serial = 0;
function clear(state: Exercise, command: Instruction) {
  const id = `clearance-${++serial}`, a = state.aircraft[0];
  const text = command.type === "lineup" ? "Delta 64, line up and wait runway 31L" : "Delta 64, runway 31L, cleared for takeoff";
  const sent = engine.applyEnvelope(state, {id, time: serial, action: {kind: "command", aircraftId: a.id, frequency: "tower", command, text}});
  assert.equal(sent.error, undefined);
  const next = engine.autoReadbacks(engine.advance(sent.state, 2), serial + 2000, () => `reply-${++serial}`);
  assert.doesNotMatch(next.messages.at(-1)!.text, /Unable/);
  assert.equal(next.messages.at(-1)!.commandId, id);
  return next;
}

for (const profile of [undefined, "A320", "B738", "C172"] as const) for (const lineup of [false, true]) {
  test(`KDAL 31L C5: ${profile ?? "legacy"} ${lineup ? "lineup then takeoff" : "direct takeoff"} respects performance without another transmission`, () => {
    let state = initial(profile);
    if (lineup) {
      state = clear(state, {type: "lineup", runway});
      for (let i = 0; i < 120 && !state.aircraft[0].holding; i++) state = engine.advance(state, 1);
      assert.equal(state.aircraft[0].holding, true);
      assert.ok(Math.abs(along(state.aircraft[0].position) - along(c5)) < .005);
      state = engine.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    }
    state = clear(state, {type: "takeoff", runway, hand: "left"});
    assert.equal(state.aircraft[0].hand, "left");
    const messages = structuredClone(state.messages);
    let previous = along(c5), maxSpeed = 0, airborne = false;
    for (let i = 0; i < 480 && !airborne && state.aircraft[0].mode !== "parked"; i++) {
      const before = state.aircraft[0]; state = engine.advance(state, .25);
      const a = state.aircraft[0], current = along(a.position);
      if (before.mode === "takeoff") assert.ok(Math.abs(a.speed - before.speed) <= acceleration(a) * .25 + 1e-7, "original acceleration and braking limit");
      assert.ok(current >= previous - 1e-6, "departure keeps the chosen intersection, without backtracking");
      previous = current; maxSpeed = Math.max(maxSpeed, a.speed);
      airborne = a.altitude > airport.elevation + 1;
      assert.ok(current < length, "stops or rotates before the runway end");
    }
    const a = state.aircraft[0];
    assert.equal(airborne, profile === "C172");
    if (!airborne) {
      assert.equal(a.mode, "parked"); assert.equal(a.takeoffOutcome, "rejected"); assert.equal(a.speed, 0);
      assert.ok(maxSpeed > 20 && maxSpeed < rotationSpeed(a), "attempts a roll, then rejects below rotation");
      const stopped = {...a.position};
      state = engine.autoReadbacks(engine.advance(state, 5), 100000, () => `unexpected-${++serial}`);
      assert.deepEqual(state.aircraft[0].position, stopped);
    }
    assert.deepEqual(state.messages, messages, "no automatic Unable, cancellation, or repeated ready call");
  });
}

test("real C5 dragged taxi route retains its entry through taxi completion and departure", () => {
  let state = initial("B738");
  const start = airport.features.find(f => f.name === "C5" && f.points.some(p => p.x > -.21))!.points.at(-1)!;
  const planned = buildGroundRoute(airport, "taxi", [start, c5], {type: "runway", id: runway});
  assert.equal(planned.error, undefined);
  state.aircraft[0] = {...state.aircraft[0], position: start, frequency: "ground", taxiPath: [], taxiIndex: 0};
  const sent = engine.applyEnvelope(state, {id: "taxi-c5", time: 0, action: {kind: "maneuver", aircraftId: "delta", command: {type: "taxi", runway, route: planned.route!, contactTowerWhenReady: true}}});
  assert.equal(sent.error, undefined); state = sent.state;
  for (let i = 0; i < 120 && state.aircraft[0].frequency === "ground"; i++) state = engine.advance(state, 1);
  assert.equal(state.aircraft[0].frequency, "tower");
  assert.ok(Math.abs(along(state.aircraft[0].position) - along(c5)) < .005);
  state = clear(state, {type: "takeoff", runway});
  assert.ok(state.aircraft[0].taxiPath.every(p => along(p) >= along(c5) - .005));
});

test("a late, fast departure overruns while braking and cannot rotate beyond the runway", () => {
  let state = initial("B738");
  Object.assign(state.aircraft[0], {mode: "takeoff", speed: 100, targetSpeed: 160,
    position: {x: geometry.departure.x - geometry.vector.x * .02, y: geometry.departure.y - geometry.vector.y * .02}, heading: geometry.heading});
  const before = structuredClone(state), predicted = engine.predictAircraft(state.aircraft, 1.5)[0];
  state = engine.advance(state, 1.5);
  assert.deepEqual({...state.aircraft[0], trail: []}, {...predicted, trail: []});
  assert.equal(state.aircraft[0].takeoffOutcome, "overrun");
  assert.ok(along(state.aircraft[0].position) > length);
  assert.ok(state.aircraft[0].speed < 100 && state.aircraft[0].speed > 0);
  assert.equal(state.aircraft[0].altitude, airport.elevation);
  assert.equal(motionSchema.parse(state).aircraft[0].takeoffOutcome, "overrun");
  assert.deepEqual(applyReplayDelta(before, replayDelta(before, state)), state);
  state = engine.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  for (let i = 0; i < 60 && state.aircraft[0].speed; i++) state = engine.advance(state, 1);
  assert.equal(state.aircraft[0].mode, "parked"); assert.equal(state.aircraft[0].speed, 0);
  assert.equal(state.aircraft[0].takeoffOutcome, "overrun");
  assert.equal(state.aircraft[0].altitude, airport.elevation);
  assert.deepEqual(state.messages, before.messages);
});

test("an earlier intersection permits an airliner takeoff at its original acceleration", () => {
  let state = initial("B738"), a = state.aircraft[0];
  const entry = graph.points.find(p => Math.abs(along(p) - .05377466983255583) < 1e-7)!;
  a.position = {...entry}; a.taxiPath = [{...entry, runway}];
  state = clear(state, {type: "takeoff", runway});
  for (let i = 0; i < 120 && state.aircraft[0].altitude === airport.elevation; i++) state = engine.advance(state, 1);
  a = state.aircraft[0];
  assert.ok(a.altitude > airport.elevation); assert.equal(a.takeoffOutcome, undefined);
  assert.ok(along(a.position) < length);
});

test("runtime departure outcomes cannot be set through an aircraft edit", () => {
  assert.equal(envelopeSchema.safeParse({id: "forge", time: 0, action: {kind: "edit", aircraftId: "delta", patch: {takeoffOutcome: "overrun"}}}).success, false);
});

test("a repeated takeoff clearance during the roll keeps its progress and runway", () => {
  let state = clear(initial("B738"), {type: "takeoff", runway});
  for (let i = 0; i < 120 && state.aircraft[0].mode !== "takeoff"; i++) state = engine.advance(state, 1);
  state = engine.advance(state, 5);
  assert.equal(state.aircraft[0].mode, "takeoff");
  assert.equal(state.aircraft[0].altitude, airport.elevation);
  const before = state.aircraft[0];
  const repeated = engine.applyEnvelope(state, {id: "repeat", time: 0, action: {kind: "maneuver", aircraftId: before.id, command: {type: "takeoff", runway, immediate: true}}});
  assert.equal(repeated.error, undefined);
  assert.deepEqual(repeated.state.aircraft[0].position, before.position);
  assert.equal(repeated.state.aircraft[0].speed, before.speed);
  assert.equal(repeated.state.aircraft[0].expedited, true);
  const opposite = engine.applyEnvelope(state, {id: "opposite", time: 0, action: {kind: "maneuver", aircraftId: before.id, command: {type: "takeoff", runway: "13R"}}});
  assert.match(opposite.error!, /current runway/);
});
