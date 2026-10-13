import {MAX_TAXI_POINTS} from "./model";
import assert from "node:assert/strict";
import test from "node:test";
import {advance, applyEnvelope, initialExercise, restoreExercise} from "./engine";
import type {Aircraft, Exercise, TaxiPoint} from "./model";
import {envelopeSchema, exerciseSchema, menteeActionAllowed} from "./protocol";
import {editedTaxiPath, hitTaxiPath, remainingTaxiPath, taxiPathState, type TaxiPathEdit} from "./taxi-path-editing";

function fixture() {
  const state = initialExercise(), a = state.aircraft[1];
  Object.assign(a, {position: {x: 0, y: 0}, taxiPath: [{x: 0, y: 0}, {x: .1, y: 0}, {x: .2, y: 0, hold: true}], taxiIndex: 1});
  return state;
}
function edit(state: Exercise, change: TaxiPathEdit, path: TaxiPoint[] = taxiPathState(state.aircraft[1]).path, id = "drag") {
  return applyEnvelope(state, {id, time: 1, action: {kind: "taxi-path", aircraftId: state.aircraft[1].id, path, edit: change}});
}

test("taxi route edits use the shared protocol and remain staff-only", () => {
  const state = fixture();
  const action = {kind: "taxi-path" as const, aircraftId: "demo-ground", path: state.aircraft[1].taxiPath, edit: {kind: "move" as const, index: 1, point: {x: .1, y: .1}}};
  assert.ok(envelopeSchema.safeParse({id: "drag", time: 1, action}).success);
  assert.equal(menteeActionAllowed(action), false);
});

test("hit testing inserts on the line and prefers existing waypoints at a junction", () => {
  const a = fixture().aircraft[1];
  assert.deepEqual(hitTaxiPath(a, {x: .05, y: .002}, .01), {kind: "insert", index: 1, point: {x: .05, y: 0}});
  assert.equal(hitTaxiPath(a, {x: .099, y: .001}, .01)?.kind, "move");
  assert.equal(hitTaxiPath(a, {x: .099, y: .001}, .01)?.index, 1);
  assert.equal(hitTaxiPath(a, {x: .05, y: .02}, .01), undefined);
  assert.equal(hitTaxiPath({...a, taxiIndex: 2}, {x: 0, y: 0}, .001)?.kind, "insert", "remaining line starts at the current aircraft position");
  assert.equal(hitTaxiPath({...a, mode: "takeoff"}, {x: .05, y: 0}, .01), undefined);
});

test("inserting then moving a waypoint preserves hold flags, motion and automatic handover", () => {
  const state = fixture(), original = structuredClone(state), a = state.aircraft[1];
  a.mode = "taxi"; a.speed = 15; a.targetSpeed = 15; a.heading = 90; a.targetHeading = 90; a.contactTowerAtHold = true;
  const result = edit(state, {kind: "insert", index: 1, point: {x: .05, y: .015}});
  assert.equal(result.error, undefined);
  const next = result.state, changed = next.aircraft[1];
  assert.equal(changed.taxiPath.length, 4); assert.equal(changed.taxiIndex, 1);
  assert.equal(changed.contactTowerAtHold, true); assert.equal(changed.mode, "taxi"); assert.equal(changed.speed, 15);
  assert.deepEqual(changed.position, a.position); assert.equal(changed.taxiPath[3].hold, true);
  assert.equal(changed.taxiPath[1].hold, undefined);
  const moved = edit(next, {kind: "move", index: 1, point: {x: .05, y: .025}}, changed.taxiPath, "move");
  assert.equal(moved.error, undefined); assert.equal(moved.state.aircraft[1].taxiPath.length, 4);
  assert.deepEqual(moved.state.aircraft[1].taxiPath[1], {x: .05, y: .025});
  assert.deepEqual(state.aircraft[1].taxiPath, original.aircraft[1].taxiPath, "commits never mutate the input snapshot");
  const duplicate = edit(next, {kind: "insert", index: 1, point: {x: 5, y: 5}}, a.taxiPath);
  assert.equal(duplicate.state, next, "the same envelope cannot insert a second point");
});

test("moving a future hold-short waypoint preserves the stop through save/reload and handover", () => {
  let state = fixture(); const a = state.aircraft[1];
  Object.assign(a, {mode: "taxi", heading: 90, targetHeading: 90, speed: 15, targetSpeed: 15, contactTowerAtHold: true, taxiPath: [{x: 0, y: 0}, {x: .02, y: 0, hold: true}]});
  const result = edit(state, {kind: "move", index: 1, point: {x: .04, y: 0}});
  assert.equal(result.error, undefined);
  state = {...restoreExercise(exerciseSchema.parse(result.state)), running: true, autoReadback: true};
  for (let i = 0; i < 20; i++) state = advance(state, 1);
  assert.equal(state.aircraft[1].holding, true); assert.equal(state.aircraft[1].frequency, "tower");
  assert.equal(state.aircraft[1].taxiIndex, 1); assert.equal(state.aircraft[1].position.x, .04);
});

test("route edits cannot overwrite a new clearance or rewind a waypoint reached during a drag", () => {
  const state = fixture(), base = structuredClone(state.aircraft[1].taxiPath);
  state.aircraft[1].taxiPath = [{x: 0, y: 0}, {x: 1, y: 1}];
  const stale = edit(state, {kind: "move", index: 1, point: {x: .15, y: 0}}, base);
  assert.match(stale.error!, /route changed/); assert.equal(stale.state, state);
  state.aircraft[1].taxiPath = base; state.aircraft[1].taxiIndex = 2;
  const passed = edit(state, {kind: "insert", index: 1, point: {x: .15, y: 0}}, base);
  assert.match(passed.error!, /already been reached/);
  const future = edit(state, {kind: "move", index: 2, point: {x: .25, y: 0}}, base);
  assert.equal(future.error, undefined); assert.equal(future.state.aircraft[1].taxiIndex, 2);
});

test("the current hold cannot be dragged away from a stopped aircraft; future edits retain hold release", () => {
  const state = fixture(), a = state.aircraft[1];
  a.position = {...a.taxiPath[1]}; a.taxiPath[1].hold = true; a.holding = true;
  assert.match(edit(state, {kind: "move", index: 1, point: {x: .1, y: .1}}).error!, /already been reached/);
  a.holding = false; a.releasedHold = 1;
  const result = edit(state, {kind: "insert", index: 2, point: {x: .15, y: .02}});
  assert.equal(result.error, undefined); assert.equal(result.state.aircraft[1].releasedHold, 1);
  assert.equal(result.state.aircraft[1].taxiPath[1].hold, true); assert.equal(result.state.aircraft[1].taxiPath[3].hold, true);
});

test("rollout edits reshape the queued runway exit rather than an old departure taxi route", () => {
  const state = fixture(), a = state.aircraft[1];
  a.mode = "rollout"; a.runwayExit = [{x: 0, y: 0}, {x: .1, y: 0}, {x: .2, y: -.06}];
  const departure = structuredClone(a.taxiPath);
  const result = edit(state, {kind: "insert", index: 2, point: {x: .15, y: -.02}});
  assert.equal(result.error, undefined); assert.equal(result.state.aircraft[1].runwayExit!.length, 4);
  assert.deepEqual(result.state.aircraft[1].taxiPath, departure);
  const restored = restoreExercise(exerciseSchema.parse(result.state));
  assert.deepEqual(remainingTaxiPath(restored.aircraft[1]), [a.position, ...restored.aircraft[1].runwayExit!.slice(1)]);
});

test("invalid points, route limits and airborne edits are rejected without changing state", () => {
  const state = fixture();
  assert.match(edit(state, {kind: "move", index: 1, point: {x: NaN, y: 0}}).error!, /exercise area/);
  assert.match(edit(state, {kind: "move", index: -1, point: {x: 0, y: 0}}).error!, /already been reached/);
  state.aircraft[1].mode = "pattern";
  assert.match(edit(state, {kind: "move", index: 1, point: {x: .1, y: 0}}).error!, /not following a taxi route/);
  state.aircraft[1].mode = "taxi";
  state.aircraft[1].taxiPath = Array.from({length: MAX_TAXI_POINTS}, (_, i) => ({x: i / 1000, y: 0}));
  assert.match(edit(state, {kind: "insert", index: 1, point: {x: .001, y: .001}}).error!, new RegExp(`${MAX_TAXI_POINTS} waypoints`));
  assert.equal(edit(state, {kind: "move", index: 1, point: {x: .001, y: .001}}).error, undefined);
});

test("a drag preview never modifies authoritative points or hold flags", () => {
  const a: Aircraft = fixture().aircraft[1], before = structuredClone(a);
  const preview = editedTaxiPath(a.taxiPath, {kind: "move", index: 2, point: {x: .3, y: .1}});
  assert.equal(preview[2].hold, true); assert.deepEqual(a, before);
});
