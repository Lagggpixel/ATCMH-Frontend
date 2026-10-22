import {getAirport} from "./airports";
import {magneticToTrue} from "./magnetic-headings";
import assert from "node:assert/strict";
import test from "node:test";
import {advance, applyEnvelope, bearing, distance, initialExercise, newAircraft, patternTargets, predictAircraft, projectedPath, restoreExercise, runwayGeometry, sequenceStatus} from "./engine";
import {DEFAULTS, type Action, type Aircraft, type Exercise, type Runway} from "./model";
import {exerciseSchema} from "./protocol";

let serial = 0;
function act(state: Exercise, action: Action) {const result = applyEnvelope(state, {id: `spacing-${++serial}`, time: serial, action}); assert.equal(result.error, undefined); return result.state;}
function point(runway: Runway, along: number, lateral: number) {const g = runwayGeometry(runway); return {x: g.threshold.x + g.vector.x * along - g.vector.y * lateral, y: g.threshold.y + g.vector.y * along + g.vector.x * lateral};}
function along(a: Aircraft) {const g = runwayGeometry(a.runway!); return (a.position.x - g.threshold.x) * g.vector.x + (a.position.y - g.threshold.y) * g.vector.y;}
function scenario(runway: Runway = "24", hand: Aircraft["hand"] = "left", leaderHand = hand, followerSpeed = 160, leaderSpeed = 160) {
  const state = initialExercise(); state.running = true;
  const follower = newAircraft("follower", true), leader = newAircraft("leader", true), g = runwayGeometry(runway);
  for (const [a, patternHand, speed, position] of [[follower, hand, followerSpeed, -1.7], [leader, leaderHand, leaderSpeed, -2.9]] as const) {
    Object.assign(a, {runway, hand: patternHand, leg: "downwind", speedMode: "manual", heading: (g.heading + 180) % 360, targetHeading: (g.heading + 180) % 360, speed, targetSpeed: speed, position: point(runway, position, patternHand === "left" ? 3 : -3)});
  }
  state.aircraft = [follower, leader];
  return act(state, {kind: "command", aircraftId: follower.id, frequency: "tower", command: {type: "sequence", number: 2, traffic: `${leaderHand} downwind`}, text: "Number 2"});
}

test("assigned sequences extend downwind and cross the threshold behind their predecessor on either runway/hand", () => {
  for (const runway of ["06", "24"] as const) for (const hand of ["left", "right"] as const) for (const opposite of [false, true]) for (const speeds of [[160, 160], [240, 100], [100, 200]]) {
    let state = scenario(runway, hand, opposite ? hand === "left" ? "right" : "left" : hand, ...speeds as [number, number]);
    let leaderArrival = 0, followerArrival = 0, maxExtension = 3, enteredBase = false;
    for (let t = 1; t <= 800 && !followerArrival; t++) {
      state = advance(state, 1); const [a, leader] = state.aircraft;
      maxExtension = Math.max(maxExtension, a.patternFinalDistance ?? 3);
      if (a.leg === "base") {enteredBase = true; assert.ok(along(a) < -2, "base does not cut back toward the airport");}
      if (!leaderArrival && leader.circuit) leaderArrival = t;
      if (a.circuit) followerArrival = t;
      if (a.leg === "final" && leader.leg === "final" && !leader.circuit) assert.ok(along(a) < along(leader), "follower cannot cut in front on final");
    }
    const description = `${runway}/${hand}/${opposite}/${speeds}`;
    assert.ok(enteredBase && followerArrival && leaderArrival, description);
    assert.ok(followerArrival - leaderArrival >= DEFAULTS.sequenceSeconds - 2, `arrival spacing ${description}: ${followerArrival - leaderArrival}s`);
    if (speeds[0] >= speeds[1]) assert.ok(maxExtension > 3.3, `extends downwind ${description}: ${maxExtension}`);
  }
});

test("automatic extension resumes when traffic clears, without releasing manual extensions or heading overrides", () => {
  let state = scenario();
  for (let i = 0; i < 200 && !sequenceStatus(state.aircraft[0], state.aircraft).includes("Extending downwind"); i++) state = advance(state, 1);
  assert.equal(state.aircraft[0].leg, "downwind");
  assert.ok(state.aircraft[0].patternFinalDistance! > 3);
  assert.equal(state.aircraft[0].extended, false, "automatic spacing is not a controller extension");
  const clear = act(state, {kind: "remove", aircraftId: "leader"});
  assert.equal(advance(clear, 1).aircraft[0].leg, "base");
  let manual = act(state, {kind: "maneuver", aircraftId: "follower", command: {type: "extend", leg: "downwind"}});
  manual = act(manual, {kind: "remove", aircraftId: "leader"});
  assert.equal(advance(manual, 5).aircraft[0].leg, "downwind");
  const heading = act(state, {kind: "maneuver", aircraftId: "follower", command: {type: "heading", value: 90}});
  const flown = advance(heading, 5).aircraft[0]; assert.equal(flown.mode, "heading"); assert.equal(flown.targetHeading, magneticToTrue(90, getAirport()));
});

test("extended base/final geometry survives reload, aligns with the runway and resets for the next circuit", () => {
  let state = scenario(); state.aircraft[1].extended = true;
  for (let i = 0; i < 30; i++) state = advance(state, 5);
  const extension = state.aircraft[0].patternFinalDistance!; assert.ok(extension > 7);
  state = restoreExercise(exerciseSchema.parse(state)); assert.equal(state.aircraft[0].patternFinalDistance, extension);
  state = act(state, {kind: "remove", aircraftId: "leader"});
  state.aircraft[0].clearedToLand = true; state.aircraft[0].landing = "full-stop";
  let landed = false;
  for (let i = 0; i < 500; i++) {
    state = advance(state, 1); const a = state.aircraft[0];
    if (a.mode === "rollout") {landed = true; assert.ok(distance(a.position, point("24", along(a), 0)) < .012); assert.equal(a.patternFinalDistance, undefined); break;}
  }
  assert.ok(landed, "extended circuit still lands on the centerline");
});

test("spacing is independent of aircraft array order and shared by display prediction/projected paths", () => {
  let state = scenario(); const saved = structuredClone(state), untouched = structuredClone(state);
  let reversed = {...state, aircraft: [...state.aircraft].reverse()};
  for (let t = 0; t < 120; t++) {
    state = advance(state, 5); reversed = advance(reversed, 5);
    assert.deepEqual(state.aircraft, [...reversed.aircraft].reverse());
  }
  const predicted = predictAircraft(saved.aircraft, 1), actual = advance(saved, 1);
  assert.deepEqual(predicted.map(a => a.position), actual.aircraft.map(a => a.position));
  const path = projectedPath(saved.aircraft[0], 100, saved.aircraft);
  assert.ok(path.some(p => along({...saved.aircraft[0], position: p}) < -3.5), "preview shows the extension");
  assert.notDeepEqual(path, projectedPath(saved.aircraft[0], 100), "predecessor affects the preview");
  assert.deepEqual(saved, untouched, "prediction leaves authoritative input unchanged");
});

test("a third arrival follows the second arrival's extended circuit rather than the unextended template", () => {
  let state = scenario(); const third = newAircraft("third", true), points = patternTargets(third);
  Object.assign(third, {leg: "downwind", position: {...points.crosswind}, heading: bearing(points.crosswind, points.downwind), targetHeading: bearing(points.crosswind, points.downwind)});
  state.aircraft.push(third);
  state = act(state, {kind: "command", aircraftId: third.id, frequency: "tower", command: {type: "sequence", number: 3, traffic: "left downwind"}, text: "Number 3"});
  assert.equal(state.aircraft[2].sequence?.followingId, "follower");
  const arrivals = new Map<string, number>();
  for (let t = 1; t < 900 && arrivals.size < 3; t++) {state = advance(state, 1); for (const a of state.aircraft) if (a.circuit && !arrivals.has(a.id)) arrivals.set(a.id, t);}
  assert.equal(arrivals.size, 3);
  assert.ok(arrivals.get("follower")! - arrivals.get("leader")! >= DEFAULTS.sequenceSeconds - 2);
  assert.ok(arrivals.get("third")! - arrivals.get("follower")! >= DEFAULTS.sequenceSeconds - 2);
});

test("automatic IAS changes preserve arrival sequencing on both runways and pattern hands", () => {
  for (const runway of ["06", "24"] as const) for (const hand of ["left", "right"] as const) {
    let state = scenario(runway, hand);
    for (const a of state.aircraft) delete a.speedMode;
    let leaderArrival = 0, followerArrival = 0;
    for (let t = 1; t <= 800 && !followerArrival; t++) {
      state = advance(state, 1);
      for (const a of state.aircraft) if (a.leg === "base") assert.ok(a.speed >= 180 - 1e-8, "automatic base speed respects its IAS floor");
      for (const a of state.aircraft) if (a.leg === "final") assert.ok(a.speed >= 135 - 1e-8, "automatic final speed never goes below Vref for spacing");
      if (!leaderArrival && state.aircraft[1].circuit) leaderArrival = t;
      if (state.aircraft[0].circuit) followerArrival = t;
    }
    assert.ok(leaderArrival && followerArrival);
    assert.ok(followerArrival - leaderArrival >= DEFAULTS.sequenceSeconds - 2, `${runway}/${hand}: ${followerArrival - leaderArrival}s`);
  }
});
