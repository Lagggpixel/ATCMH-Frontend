import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {getAirport} from "./airports";
import {exerciseSchema, motionSchema, envelopeSchema} from "./protocol";
import {seedSchema} from "./scenarios";
import {applyReplayDelta, replayDelta} from "./replays";
import type {Action, Aircraft, Exercise, Instruction} from "./model";

const selection = {airport: "KDAL"}, e = engineFor(selection), airport = getAirport(selection);

const parallels: Record<string, string> = {"13L": "13R", "13R": "13L", "31L": "31R", "31R": "31L"};

let serial = 0;

function act(state: Exercise, action: Action) {
  const result = e.applyEnvelope(state, {id: `uwc-spacing-${++serial}`, time: serial, action});
  assert.equal(result.error, undefined);
  return result.state;
}

function fixture(runway = "13L", speeds = [220, 220]) {
  const state = e.initialExercise(); state.running = true;
  state.aircraft = [runway, parallels[runway]].map((runway, i): Aircraft => {
    const g = e.runwayGeometry(runway);
    return {...e.newAircraft(i ? "leader" : "follower", true), runway, frequency: "tower", mode: "pattern", leg: "upwind",
      hand: runway.endsWith("R") ? "right" : "left", landing: "touch-and-go", clearedToLand: true, clearedForOption: true,
      altitude: airport.elevation + 1500, heading: g.heading, targetHeading: g.heading, speed: speeds[i], targetSpeed: speeds[i], speedMode: "manual",
      position: {x: g.departure.x + g.vector.x * 4, y: g.departure.y + g.vector.y * 4}};
  });
  state.conflicts = [{id: "uwc", kind: "uwc", first: "follower", second: "leader", runway,
    otherRunway: parallels[runway], phase: "requested", started: 0, circuit: 0}];
  return state;
}

function entry(state: Exercise): Instruction {
  const leader = state.aircraft.find(a => a.id === "leader")!;
  return {type: "pattern", runway: leader.runway!, hand: leader.hand, leg: "downwind", sequence: {number: 2, traffic: `${leader.hand} crosswind`}};
}

const enter = (state: Exercise) => act(state, {kind: "maneuver", aircraftId: "follower", command: entry(state)});

function along(a: Aircraft) {
  const g = e.runwayGeometry(a.runway!);
  return (a.position.x - g.threshold.x) * g.vector.x + (a.position.y - g.threshold.y) * g.vector.y;
}

test("UWC sequences create space before merging on every KDAL parallel direction, including faster followers", () => {
  for (const runway of Object.keys(parallels)) for (const speeds of [[220, 220], [240, 160], [160, 220]]) {
    const input = fixture(runway, speeds), before = structuredClone(input);
    let state = enter(input);
    assert.deepEqual(input, before);
    assert.equal(state.conflicts![0].phase, "complete");
    assert.equal(state.aircraft[1].leg, "crosswind", "the predecessor is released first");
    assert.equal(state.aircraft[0].leg, "upwind");
    assert.equal(state.aircraft[0].patternEntry, "downwind");
    assert.equal(state.aircraft[0].sequence?.followingId, "leader");
    assert.deepEqual(state.aircraft.map(a => a.position), input.aircraft.map(a => a.position), "no repositioning");
    state = act(state, {kind: "maneuver", aircraftId: "follower", command: {type: "land", option: true}});
    const initialGap = e.distance(state.aircraft[0].position, state.aircraft[1].position);
    let joined = false, minimum = Infinity, leaderArrival = 0, followerArrival = 0;
    for (let t = 1; t <= 1000 && !followerArrival; t++) {
      state = e.advance(state, 1); const [a, b] = state.aircraft;
      const gap = e.distance(a.position, b.position);
      if (a.patternEntry) assert.ok(gap >= initialGap - .06, `${runway}/${speeds}: holding must not converge`);
      else if (!a.circuit && !b.circuit) {
        joined = true;
        if (["crosswind", "downwind"].includes(b.leg)) minimum = Math.min(minimum, gap);
      }
      if (!a.circuit && !b.circuit) assert.equal(a.sequence?.followingId, "leader", "spacing retains the assigned predecessor");
      if (!leaderArrival && b.circuit) leaderArrival = t;
      if (a.circuit) followerArrival = t;
      if (a.leg === "final" && b.leg === "final" && !b.circuit) assert.ok(along(b) - along(a) >= 2.98, `${runway}/${speeds}: final spacing`);
    }
    assert.ok(joined && leaderArrival && followerArrival > leaderArrival, `${runway}/${speeds}: both complete in order`);
    assert.ok(Number.isFinite(minimum) && minimum >= 3, `${runway}/${speeds}: merge separation ${minimum} NM`);
  }
});

test("equal-speed sequenced aircraft open a gap on downwind instead of remaining on top of each other", () => {
  let state = fixture(); state.conflicts = [];
  const g = e.runwayGeometry("13R");
  state.aircraft = state.aircraft.map((a, i) => ({...a, runway: "13R", hand: "right", leg: "downwind",
    position: {x: g.threshold.x + g.vector.x * (i ? .5 : 1.5) + g.vector.y * 3,
      y: g.threshold.y + g.vector.y * (i ? .5 : 1.5) - g.vector.x * 3},
    heading: (g.heading + 180) % 360, targetHeading: (g.heading + 180) % 360}));
  state = act(state, {kind: "maneuver", aircraftId: "follower", command: {type: "sequence", number: 2, traffic: "Right Downwind"}});
  let reversed = {...state, aircraft: [...state.aircraft].reverse()};
  for (let t = 0; t < 60; t++) {state = e.advance(state, 1); reversed = e.advance(reversed, 1); assert.deepEqual(state.aircraft, [...reversed.aircraft].reverse());}
  const [a, b] = state.aircraft;
  assert.ok(e.distance(a.position, b.position) > 1.5);
  assert.ok(a.speed < b.speed);
  assert.equal(a.targetSpeed, 220, "the controller's speed target is preserved");
});

test("a natural UWC touch-and-go and runway-change readback uses the same protected merge", () => {
  for (const runway of ["13L", "13R"]) {
    let state = fixture(runway); state.conflicts = []; state.autoReadback = true;
    for (const a of state.aircraft) {
      const g = e.runwayGeometry(a.runway!);
      Object.assign(a, {leg: "final", speed: 135, targetSpeed: 135, altitude: airport.elevation + 636,
        position: {x: g.threshold.x - g.vector.x * 2, y: g.threshold.y - g.vector.y * 2}});
    }
    state = act(state, {kind: "conflict", conflict: "uwc", aircraftId: "follower", otherId: "leader"});
    for (let t = 0; t < 180 && state.conflicts![0].phase !== "requested"; t++) {
      state = e.advance(state, 1);
      state = e.autoReadbacks(state, t * 1000, () => `natural-${++serial}`);
    }
    assert.equal(state.conflicts![0].phase, "requested");
    assert.equal(state.messages.filter(m => m.request?.id === "runway-change").length, 1);
    for (let t = 0; t < 30 && state.aircraft.some(a => a.mode === "takeoff"); t++) state = e.advance(state, 1);
    state = act(state, {kind: "command", aircraftId: "follower", frequency: "tower", command: entry(state), text: "Enter downwind, number 2"});
    state = e.advance(state, 2);
    state = e.autoReadbacks(state, 1000000, () => `entry-${++serial}`);
    assert.equal(state.aircraft[0].patternEntry, "downwind");
    let joined = false;
    for (let t = 0; t < 200 && !joined; t++) {
      state = e.advance(state, 1);
      joined = !state.aircraft[0].patternEntry;
      if (joined) assert.ok(e.distance(state.aircraft[0].position, state.aircraft[1].position) >= 3);
    }
    assert.ok(joined, `${runway}: the follower eventually joins`);
  }
});

test("UWC entry waits for the applied manual or automatic readback, then survives snapshot and motion recovery", () => {
  for (const automatic of [false, true]) {
    let state = fixture(); state.autoReadback = automatic;
    state = act(state, {kind: "command", aircraftId: "follower", frequency: "tower", text: "Enter downwind, number 2", command: entry(state)});
    const command = state.messages.at(-1)!;
    assert.equal(state.conflicts![0].phase, "requested");
    assert.equal(state.aircraft[0].patternEntry, undefined);
    state = e.advance(state, 2);
    assert.equal(state.aircraft[1].leg, "upwind");
    state = automatic ? e.autoReadbacks(state, 100000, () => `auto-${++serial}`)
      : act(state, {kind: "pilot", aircraftId: "follower", replyTo: command.id, assign: true, text: "Entering downwind behind the traffic"});
    assert.equal(state.conflicts![0].phase, "complete");
    assert.equal(state.aircraft[0].patternEntry, "downwind");
    state = e.advance(state, 5);
    const saved = structuredClone(state), recovered = e.restoreExercise(exerciseSchema.parse(state));
    assert.equal(recovered.aircraft[0].patternEntry, "downwind");
    assert.equal(motionSchema.parse(state).aircraft[0].patternEntry, "downwind");
    assert.deepEqual(e.predictAircraft(state.aircraft, 1).map(a => a.position), e.advance(state, 1).aircraft.map(a => a.position));
    assert.deepEqual(e.advance(recovered, 1).aircraft.map(a => a.position), e.advance(state, 1).aircraft.map(a => a.position));
    e.projectedPath(state.aircraft[0], 120, state.aircraft);
    assert.deepEqual(state, saved, "prediction cannot release the real aircraft or mutate its predecessor");
  }
  assert.equal(envelopeSchema.safeParse({id: "edit", time: 0, action: {kind: "edit", aircraftId: "follower", patch: {patternEntry: "downwind"}}}).success, false);
});

test("removing the leader and explicit movement instructions release or replace the pending entry", () => {
  const waiting = enter(fixture());
  const removed = act(waiting, {kind: "remove", aircraftId: "leader"});
  const released = e.advance(removed, .1).aircraft[0];
  assert.equal(released.patternEntry, undefined);
  assert.equal(released.leg, "downwind");
  for (const command of [{type: "heading", value: 90}, {type: "extend", leg: "upwind"}, {type: "pattern", leg: "base"},
    {type: "go-around"}, {type: "frequency", frequency: null}] satisfies Instruction[]) {
    const state = act(waiting, {kind: "maneuver", aircraftId: "follower", command});
    assert.equal(state.aircraft[0].patternEntry, undefined, command.type);
    if (command.type === "extend") assert.equal(e.advance(state, 5).aircraft[0].extended, true, "manual extensions remain manual");
  }
  const unsequenced = fixture();
  const command = entry(unsequenced); assert.equal(command.type, "pattern");
  const state = act(unsequenced, {kind: "maneuver", aircraftId: "follower", command: {...command, sequence: undefined}});
  assert.equal(state.aircraft[0].patternEntry, undefined, "an unsequenced entry is not silently assigned a predecessor");
  assert.equal(state.aircraft[0].leg, "downwind");
});

test("pending entries round-trip through replay deltas but cannot become scenario starting state", () => {
  const wire = (state: Exercise): Exercise => JSON.parse(JSON.stringify(state));
  const before = fixture(), waiting = enter(before);
  const recorded = applyReplayDelta(before, replayDelta(before, waiting));
  assert.deepEqual(wire(recorded), wire(waiting));
  const overridden = act(waiting, {kind: "maneuver", aircraftId: "follower", command: {type: "heading", value: 90}});
  assert.deepEqual(wire(applyReplayDelta(recorded, replayDelta(waiting, overridden))), wire(overridden));
  assert.equal("patternEntry" in seedSchema.parse(waiting.aircraft[0]), false);
  assert.equal(exerciseSchema.parse(before).aircraft[0].patternEntry, undefined, "legacy snapshots need no new field");
});

test("UWC tolerates different legs and altitudes and survives the natural base turn", () => {
  const e = engineFor({airport: "KJFK"}), s = e.initialExercise(); s.running = true;
  s.aircraft = ["a", "b"].map((id, i) => {const a = e.newAircraft(id, true); a.runway = i ? "22R" : "22L"; a.mode = "pattern"; a.leg = "downwind"; a.landing = "touch-and-go"; a.position = e.patternTargets(a).crosswind; a.altitude = 1513 + i * 1000; a.speed = a.targetSpeed = 180; return a;});
  s.aircraft[1].leg = "crosswind";
  const result = e.applyEnvelope(s, {id: "uwc", time: 1, action: {kind: "conflict", conflict: "uwc", aircraftId: "a", otherId: "b"}});
  assert.equal(result.error, undefined); let state = result.state;
  let base = false;
  for (let i = 0; i < 600; i++) {state = e.advance(state, 1); base ||= state.aircraft.some(a => a.leg === "base"); assert.notEqual(state.conflicts![0].outcome, "Aircraft are no longer naturally aligned");}
  assert.ok(base);
});
