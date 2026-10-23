import assert from "node:assert/strict";
import test from "node:test";
import {advance, AIRPORT, applyEnvelope, departureRoute, distance, initialExercise, patternTargets, predictAircraft, projectedPath, runwayGeometry, validateInstruction} from "./engine";
import {commandTasks, instructionText} from "./catalog";
import {DEFAULTS, type Action, type Exercise, type Runway, type Instruction} from "./model";
import {exerciseSchema} from "./protocol";

let serial = 0;
function act(state: Exercise, action: Action) {const result = applyEnvelope(state, {id: `nav-${++serial}`, time: serial, action}); assert.equal(result.error, undefined); return result.state;}
const local = (p: {x: number; y: number}, runway: Runway) => {const g = runwayGeometry(runway); return {along: (p.x - g.threshold.x) * g.vector.x + (p.y - g.threshold.y) * g.vector.y, lateral: (p.x - g.threshold.x) * -g.vector.y + (p.y - g.threshold.y) * g.vector.x};};

test("left/right patterns on both runways repeat ordered legs, stay on the correct side and intercept final", () => {
  for (const runway of ["06", "24"] as const) for (const hand of ["left", "right"] as const) {
    let state = initialExercise(); const a = state.aircraft[0], g = runwayGeometry(runway);
    Object.assign(a, {runway, hand, leg: "upwind", heading: g.heading, targetHeading: g.heading, position: {...g.departure}, flightPlan: []});
    state.running = true;
    const transitions: string[] = []; let previous = "", finals = 0, maxSide = 0;
    for (let i = 0; i < 1600; i++) {
      state = advance(state, 1); const plane = state.aircraft[0], q = local(plane.position, runway);
      maxSide = Math.max(maxSide, Math.abs(q.lateral));
      if (plane.leg !== previous) {transitions.push(plane.leg); previous = plane.leg;}
      if (plane.leg === "final" && q.along > -.15 && q.along < -.02) {finals++; assert.ok(Math.abs(q.lateral) < .02, `final ${runway}/${hand}: ${q.lateral}`);}
      assert.ok(hand === "left" ? q.lateral > -.12 : q.lateral < .12, "stays on assigned traffic side");
    }
    assert.ok(finals > 0); assert.ok(maxSide > DEFAULTS.patternWidth - .2 && maxSide < DEFAULTS.patternWidth + .3);
    assert.deepEqual(transitions.slice(0, 11), ["upwind", "crosswind", "downwind", "base", "final", "upwind", "crosswind", "downwind", "base", "final", "upwind"]);
  }
});

test("a clearance from a stand taxis, lines up and rotates on the chosen runway without teleporting", () => {
  for (const runway of ["06", "24"] as const) {
    let state = initialExercise(); const a = state.aircraft[1]; a.frequency = "tower";
    const position = {...a.position}; assert.equal(validateInstruction(a, {type: "takeoff", runway}, "tower"), null);
    const task = commandTasks("tower", a).find(t => t.id === "takeoff")!;
    const entry = {instruction: {...task.command, runway, hand: "right"} as Instruction};
    state = act(state, {kind: "command", aircraftId: a.id, frequency: "tower", command: entry.instruction!, text: "Clearance before request"});
    state = act(state, {kind: "pilot", aircraftId: a.id, replyTo: state.messages.at(-1)!.id, assign: true, text: "Readback"});
    assert.deepEqual(state.aircraft[1].position, position); assert.equal(state.aircraft[1].mode, "lineup");
    state.running = true; let rolled = false, rotated = false;
    for (let i = 0; i < 1000 && !rotated; i++) {
      const before = state.aircraft[1]; state = advance(state, 1); const plane = state.aircraft[1];
      assert.ok(distance(before.position, plane.position) < .06, "no teleport");
      if (plane.mode === "takeoff" && plane.altitude <= AIRPORT.elevation + 1) {
        rolled = true; const q = local(plane.position, runway); assert.ok(Math.abs(q.lateral) < 1e-6); assert.ok(q.along >= 0 && q.along < distance(runwayGeometry(runway).threshold, runwayGeometry(runway).departure));
      }
      rotated = plane.altitude > AIRPORT.elevation + 1;
    }
    assert.ok(rolled && rotated, `${runway} departure reaches rotation`);
  }
});

test("option choices preserve current traffic until touchdown then fly the requested opposite pattern", () => {
  let state = initialExercise(); const a = state.aircraft[0], g = runwayGeometry();
  a.position = {...g.threshold}; a.altitude = AIRPORT.elevation+2; a.speed = 140;
  const task = commandTasks("tower", a).find(t => t.id === "land")!;
  const entry = {instruction: {...task.command, runway: "24", number: 2, option: true, hand: "right"} as Instruction};
  assert.match(instructionText(a, entry.instruction!), /number 2, runway 24, cleared for the option, after the option, make right traffic/);
  state = act(state, {kind: "command", aircraftId: a.id, frequency: "tower", command: entry.instruction!, text: "Option"});
  state = act(state, {kind: "pilot", aircraftId: a.id, replyTo: state.messages.at(-1)!.id, assign: true, text: "Readback"});
  assert.equal(state.aircraft[0].hand, "left"); assert.equal(state.aircraft[0].optionHand, "right");
  state.running = true; state = advance(state, 1);
  assert.equal(state.aircraft[0].hand, "right"); assert.equal(state.aircraft[0].optionHand, undefined);
});

test("an intersection with insufficient runway is rejected without silently back-taxiing", () => {
  const state = initialExercise(), a = state.aircraft[1], g = runwayGeometry();
  a.frequency = "tower"; a.position = {x: g.departure.x - g.vector.x * .15, y: g.departure.y - g.vector.y * .15};
  const result = applyEnvelope(state, {id: "short-intersection", time: 0, action: {kind: "maneuver", aircraftId: a.id, command: {type: "takeoff", runway: "24"}}});
  assert.match(result.error!, /Insufficient runway remaining/);
  assert.equal(result.state, state);
});

test("sequencing resolves the preceding arrival and survives readbacks/reload", () => {
  let state = initialExercise(); const a = state.aircraft[0];
  Object.assign(state.aircraft[1], {frequency: "tower", mode: "pattern", leg: "downwind", hand: "left"});
  const task = commandTasks("tower", a).find(t => t.id === "arrival-sequence")!;
  const entry = {instruction: {...task.command, number: 2, traffic: "Left Downwind"} as Instruction};
  const command = entry.instruction!;
  assert.equal(command.type, "sequence");
  state = act(state, {kind: "command", aircraftId: a.id, frequency: "tower", command, text: instructionText(a, command)});
  assert.equal(state.aircraft[0].sequence?.followingId, "demo-ground");
  state = act(state, {kind: "pilot", aircraftId: a.id, replyTo: state.messages.at(-1)!.id, text: "Number 2"});
  assert.equal(exerciseSchema.parse(state).aircraft[0].sequence?.number, 2);
});

test("radar prediction matches engine motion, shares immutable history and never changes authoritative state", () => {
  const state = initialExercise(); state.running = true; const saved = structuredClone(state);
  const predicted = predictAircraft(state.aircraft, 1), actual = advance(state, 1);
  assert.deepEqual(predicted[0].position, actual.aircraft[0].position); assert.deepEqual(state, saved);
  assert.equal(actual.messages, state.messages); assert.equal(actual.processed, state.processed);
  const path = projectedPath(state.aircraft[0]); assert.ok(path.length > 40); assert.deepEqual(state, saved);
  assert.notDeepEqual(path[0], path.at(-1)); assert.equal(departureRoute(state.aircraft[1], "24").error, undefined);
});

test("a landing flown from downwind touches down on centerline, rather than orbiting a threshold", () => {
  let state = initialExercise(); const a = state.aircraft[0], points = patternTargets(a), g = runwayGeometry();
  Object.assign(a, {leg: "downwind", position: {...points.crosswind}, heading: (g.heading + 180) % 360, targetHeading: (g.heading + 180) % 360, clearedToLand: true, landing: "full-stop"});
  state.running = true; let landed = false;
  for (let i = 0; i < 600; i++) {state = advance(state, 1); if (state.aircraft[0].mode === "rollout" || state.aircraft[0].mode === "parked") {landed = true; assert.ok(Math.abs(local(state.aircraft[0].position, "24").lateral) < .012); break;}}
  assert.ok(landed, "normal base/final leads to runway touchdown");
});
