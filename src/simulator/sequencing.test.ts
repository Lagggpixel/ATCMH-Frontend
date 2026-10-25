import assert from "node:assert/strict";
import test from "node:test";
import {advance, autoReadbacks, applyEnvelope, followedAircraft, headingProjection, initialExercise, newAircraft, patternTargets, restoreExercise, runwayGeometry, sequenceStatus, engineFor} from "./engine";
import {DEFAULTS, patternLegLabel, pendingCommands, type Action, type Aircraft, type Exercise, type Instruction} from "./model";
import {exerciseSchema, envelopeSchema} from "./protocol";

let serial = 0;

function act(state: Exercise, action: Action) {const result = applyEnvelope(state, {id: `seq-${++serial}`, time: serial, action}); assert.equal(result.error, undefined); return result.state;}

function send(state: Exercise, command: Instruction) {return act(state, {kind: "command", aircraftId: "follower", frequency: "tower", command, text: command.type});}

function traffic() {
  const state = initialExercise();
  const follower = newAircraft("follower", true), first = newAircraft("first", true), second = newAircraft("second", true), otherRunway = newAircraft("other", true);
  Object.assign(follower, {leg: "downwind", position: patternTargets(follower).crosswind});
  Object.assign(first, {position: runwayGeometry().threshold});
  Object.assign(second, {leg: "base", position: patternTargets(second).downwind});
  Object.assign(otherRunway, {runway: "06", position: runwayGeometry("06").threshold});
  state.aircraft = [follower, first, second, otherRunway]; return state;
}

const sequence = (number = 2, leg = "Final"): Instruction => ({type: "sequence", number, traffic: leg});

test("staff sees the pending batch but can answer only its latest command, once", () => {
  let state = traffic();
  state = send(state, {type: "pattern", leg: "base"}); const old = state.messages.at(-1)!.id;
  state = send(state, {type: "extend", leg: "downwind"});
  state = send(state, {type: "speed", value: 180}); const latest = state.messages.at(-1)!.id;
  assert.equal(pendingCommands(state, "follower").length, 3);
  const obsolete = applyEnvelope(state, {id: "obsolete", time: 1, action: {kind: "pilot", aircraftId: "follower", text: "Old", replyTo: old, assign: true}});
  assert.match(obsolete.error!, /latest/); assert.equal(obsolete.state, state);
  state = act(state, {kind: "pilot", aircraftId: "follower", text: "180", replyTo: latest, assign: true});
  assert.equal(state.aircraft[0].targetSpeed, 180); assert.equal(state.aircraft[0].leg, "downwind");
  assert.equal(pendingCommands(state, "follower").length, 0);
  assert.equal(pendingCommands(restoreExercise(exerciseSchema.parse(state)), "follower").length, 0);
  state = send(state, {type: "stop"}); assert.equal(pendingCommands(state, "follower").length, 1);
  state = act(state, {kind: "pilot", aircraftId: "follower", replyTo: state.messages.at(-1)!.id, text: "Unable"});
  assert.equal(pendingCommands(state, "follower").length, 0);
});

test("runway sequence numbers and a single final resolve the actual predecessor", () => {
  let state = send(traffic(), sequence());
  assert.equal(followedAircraft(state.aircraft[0], state.aircraft)?.id, "first");
  state = send(state, sequence(3, "Left Base"));
  assert.equal(followedAircraft(state.aircraft[0], state.aircraft)?.id, "second");
  state = send(state, sequence(3, "Final")); assert.equal(state.aircraft[0].sequence?.followingId, "second", "a leg change cannot discard the numbered predecessor");
  state = send(state, {...sequence(), followingId: "other"} as Instruction);
  assert.equal(state.aircraft[0].sequence?.followingId, "first", "arbitrary id is ignored");
  assert.equal(patternLegLabel({...state.aircraft[0], leg: "final", hand: "right"}), "final");
  assert.equal(patternLegLabel({...state.aircraft[0], leg: "final", hand: "left"}), "final");
  assert.match(sequenceStatus(state.aircraft[1], state.aircraft), /no sequence required/);
  assert.match(sequenceStatus({...state.aircraft[0], sequence: undefined}, state.aircraft), /Sequence required/);
});

test("numbered landing clearances do not assign a sequence and cannot replace sequencing", () => {
  let state = send(traffic(), {type: "land", number: 2, followingId: "first"});
  assert.equal(state.aircraft[0].sequence, undefined);
  state = send(state, sequence());
  state = send(state, {type: "land", number: 2}); assert.equal(state.aircraft[0].sequence?.followingId, "first");
  state = send(state, {type: "land", number: 1}); assert.equal(state.aircraft[0].sequence, undefined);
  assert.equal(envelopeSchema.safeParse({id: "edit", time: 1, action: {kind: "edit", aircraftId: "follower", patch: {sequence: {number: 2, followingId: "first"}}}}).success, false);
});

test("a combined pattern entry and sequence follows the selected runway when assigned", () => {
  let state = send(traffic(), {type: "pattern", leg: "downwind", hand: "right", runway: "06", sequence: {number: 2, traffic: "Final"}});
  assert.equal(state.aircraft[0].runway, "24", "sending alone does not fly the maneuver");
  state = act(state, {kind: "pilot", aircraftId: "follower", replyTo: state.messages.at(-1)!.id, assign: true, text: "Entering right downwind 06, number 2"});
  assert.equal(state.aircraft[0].sequence?.followingId, "other");
  assert.equal(followedAircraft(state.aircraft[0], state.aircraft)?.id, "other");
});

test("sequence expires after own runway changes and when preceding traffic changes runway, leaves or is removed", () => {
  const queued = send(traffic(), sequence());
  for (const action of [
    {kind: "edit", aircraftId: "first", patch: {runway: "06"}},
    {kind: "edit", aircraftId: "first", patch: {frequency: null}},
    {kind: "remove", aircraftId: "first"},
    {kind: "maneuver", aircraftId: "first", command: {type: "go-around"}},
    {kind: "maneuver", aircraftId: "follower", command: {type: "runway", runway: "06"}},
  ] as Action[]) assert.equal(act(queued, action).aircraft[0].sequence, undefined);
});

test("every completed circuit, touch-and-go and go-around requires a fresh sequence", () => {
  for (const landing of [false, true]) {
    const state = send(traffic(), sequence(3, "Left Base")); const a = state.aircraft[0], g = runwayGeometry();
    Object.assign(a, {leg: "final", position: {...g.threshold}, heading: g.heading, clearedToLand: landing, altitude: landing ? 136 : 1636});
    // This test isolates circuit clearance expiry; keep the other arrival clear
    // of the threshold now that physical contact generates a crash.
    state.aircraft[1].position = {...patternTargets(state.aircraft[1]).downwind};
    state.running = true;
    const next = advance(state, .1);
    assert.equal(next.aircraft[0].sequence, undefined); assert.equal(next.aircraft[0].circuit, 1);
    assert.equal(state.aircraft[0].circuit, undefined, "advance is immutable");
  }
  const state = act(send(traffic(), sequence()), {kind: "maneuver", aircraftId: "follower", command: {type: "go-around"}});
  assert.equal(state.aircraft[0].sequence, undefined);
});

test("a predecessor starting a new circuit invalidates a follow link rather than silently reassigning", () => {
  const state = send(traffic(), sequence()); state.running = true;
  const next = advance(state, .1);
  assert.equal(next.aircraft[0].sequence, undefined);
});

test("30-second trails expire by exercise time at every speed and survive wire snapshots", () => {
  let state = traffic(); state.running = true;
  for (const a of state.aircraft) Object.assign(a, {mode: "heading", speed: 15, targetSpeed: 15});
  for (let i = 0; i < 80; i++) state = advance(state, .5);
  for (const a of state.aircraft) {
    assert.ok(a.trail.length >= 99 && a.trail.length <= 102);
    assert.ok(a.trail.every(p => p.time! >= state.elapsed - 30 - 1e-8));
    assert.ok(a.trail[0].time! < state.elapsed - 29.5);
  }
  assert.deepEqual(exerciseSchema.parse(state).aircraft[0].trail, state.aircraft[0].trail);
  state.aircraft[0].trail = [{x: 0, y: 0}]; assert.deepEqual(restoreExercise(state).aircraft[0].trail, []);
  const paused = {...state, running: false}; assert.equal(advance(paused, 60), paused);
});

test("heading projection is straight, white-line geometry for current heading and 30 seconds of current speed", () => {
  const a = {...newAircraft("a", true), position: {x: 1, y: 2}, heading: 90, targetHeading: 180, speed: 120} as Aircraft;
  assert.deepEqual(headingProjection(a), [a.position, {x: 2, y: 2}]);
  assert.equal(DEFAULTS.radarSeconds, 30);
});

test("pattern entry after a transition restores its follow link on manual and automatic assignment", () => {
  for (const automatic of [false, true]) {
    let state = traffic(); state.aircraft = state.aircraft.slice(0, 2);
    state.aircraft[1].position = patternTargets(state.aircraft[1]).base;
    state = act(state, {kind: "maneuver", aircraftId: "follower", command: {type: "transition", altitude: 2500}});
    assert.equal(state.aircraft[0].leavingCircuit, true);
    state.autoReadback = automatic;
    state = send(state, {type: "pattern", leg: "downwind", hand: "right", runway: "24", sequence: {number: 2, traffic: "Final"}});
    if (automatic) {
      state.running = true;
      state = autoReadbacks(advance(state, 1.5), ++serial, () => `automatic-seq-${serial}`);
    } else state = act(state, {kind: "pilot", aircraftId: "follower", replyTo: state.messages.at(-1)!.id, assign: true, text: "Entering right downwind 24, number 2"});
    assert.equal(state.aircraft[0].leavingCircuit, undefined);
    assert.equal(followedAircraft(state.aircraft[0], state.aircraft)?.id, "first", `Automatic ${automatic}`);
    const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    assert.equal(followedAircraft(restored.aircraft[0], restored.aircraft)?.id, "first");
  }
});

test("sequencing survives a stale spoken leg and rejects circular follow dependencies", () => {
  const e = engineFor({airport: "EGPH"}); let s = e.initialExercise();
  s.aircraft = ["a", "b"].map((id, i) => {const a = e.newAircraft(id, true); a.leg = "downwind"; a.position = {...e.patternTargets(a).crosswind, x: e.patternTargets(a).crosswind.x + i}; return a;});
  const first = e.applyEnvelope(s, {id: "follow-b", time: 1, action: {kind: "command", aircraftId: "a", frequency: "tower", command: {type: "sequence", number: 2, traffic: "Final"}, text: "number 2 traffic final"}});
  assert.equal(first.error, undefined); assert.equal(first.state.aircraft[0].sequence?.followingId, "b"); s = first.state;
  const second = e.applyEnvelope(s, {id: "follow-a", time: 2, action: {kind: "command", aircraftId: "b", frequency: "tower", command: {type: "sequence", number: 2, traffic: patternLegLabel(s.aircraft[0])}, text: "number 2"}});
  assert.match(second.error!, /follow each other/); assert.equal(second.state, s);
});
