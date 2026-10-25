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

test("Heathrow resequencing respects the assigned leader ahead of a closer downwind aircraft", () => {
  const e = engineFor({airport: "EGLL"});
  for (const automatic of [false, true]) for (const maneuver of [false, true]) {
    let state = e.initialExercise(); state.autoReadback = automatic;
    state.aircraft = [
      {id: "speedbird", callsign: "Speedbird 401", leg: "final", position: {x: 17.89135879507937, y: .5604686266992776}, patternFinalDistance: 19.01268000535787},
      {id: "lufthansa", callsign: "Lufthansa 402", leg: "downwind", position: {x: 7.175049921033803, y: 4.370040176992097}, patternFinalDistance: 8.316314307151016},
      {id: "emirates", callsign: "Emirates 405 Heavy", leg: "base", position: {x: 20.81130467452539, y: 4.584423445586558}, patternFinalDistance: 20.400859641515705},
    ].map(seed => ({...e.newAircraft(seed.id, true), ...seed, leg: seed.leg as Aircraft["leg"], runway: "27R", mode: "pattern", hand: "right", frequency: "tower", altitude: 1583}));
    const link = (followingId: string, traffic: string) => ({number: 2, traffic, followingId, runway: "27R", circuit: 0, followingCircuit: 0});
    state.aircraft[1].sequence = link("speedbird", "Right Base");
    state.aircraft[2].sequence = link("lufthansa", "Final");
    const input = state, before = structuredClone(state);
    const issue = (aircraftId: string, number: number, traffic: string) => {
      const command: Instruction = {type: "sequence", number, traffic};
      const result = e.applyEnvelope(state, {id: `egll-${++serial}`, time: serial, action: maneuver
        ? {kind: "maneuver", aircraftId, command}
        : {kind: "command", aircraftId, frequency: "tower", command, text: `Number ${number}, traffic ${traffic}`}});
      assert.equal(result.error, undefined); state = result.state;
    };
    issue("emirates", 2, "Final");
    assert.equal(state.aircraft[2].sequence?.followingId, "speedbird", "number two follows the established first arrival");
    assert.equal(state.aircraft[1].sequence?.followingId, "speedbird", "another aircraft still needs its own revised instruction");
    issue("lufthansa", 3, "Right Base");
    assert.equal(state.aircraft[1].sequence?.followingId, "emirates");
    assert.deepEqual(input, before, "the original snapshot is immutable");
    state = e.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    assert.deepEqual(state.aircraft.map(a => e.arrivalNumber(a, state.aircraft)), [1, 3, 2]);
    assert.match(e.sequenceStatus(state.aircraft[2], state.aircraft), /Following Speedbird 401/);
    assert.match(e.sequenceStatus(state.aircraft[1], state.aircraft), /Following Emirates 405 Heavy/);
  }
});

test("arrival numbers retain multi-aircraft follow chains and discard expired links", () => {
  const e = engineFor({airport: "EGPH"}), state = e.initialExercise();
  state.aircraft = ["third", "second", "first", "fourth"].map((id, i) => {
    const a = e.newAircraft(id, true), g = e.runwayGeometry(a.runway!);
    return {...a, leg: "final" as const, position: {x: g.threshold.x - g.vector.x * (i + 2), y: g.threshold.y - g.vector.y * (i + 2)}};
  });
  for (const [index, followingId] of [[0, "second"], [1, "first"]] as const) state.aircraft[index].sequence = {
    number: index === 0 ? 3 : 2, followingId, runway: state.aircraft[index].runway!, circuit: 0, followingCircuit: 0,
  };
  assert.deepEqual(state.aircraft.map(a => e.arrivalNumber(a, state.aircraft)), [3, 2, 1, 4]);
  state.aircraft[2].circuit = 1;
  assert.deepEqual(state.aircraft.map(a => e.arrivalNumber(a, state.aircraft)), [2, 1, 3, 4], "a stale circuit cannot keep its former leader ahead");
});

test("Swiss number three follows Air France rather than counting unjoined Heathrow arrivals", () => {
  const e = engineFor({airport: "EGLL"});
  for (const automatic of [false, true]) {
    let state = e.initialExercise(); state.autoReadback = automatic; state.running = true;
    state.aircraft = [
      {id: "virgin", callsign: "Virgin 403 Heavy", mode: "pattern", position: {x: 2.528973875018822, y: -.33962044505148237}},
      {id: "airfrance", callsign: "Air France 404", mode: "pattern", position: {x: 14.151003828297476, y: -.28762339003263426}},
      {id: "swiss", callsign: "Swiss 407", mode: "heading", position: {x: 9.015055032736935, y: -5.094329813423577}},
      {id: "qatar", callsign: "Qatar 408 Heavy", mode: "heading", position: {x: 11.6073641905853, y: -8.065068584864186}},
      {id: "klm", callsign: "KLM 410", mode: "heading", position: {x: -2.276933182549177, y: 14.29252898024346}},
    ].map(seed => ({...e.newAircraft(seed.id, true), ...seed, mode: seed.mode as Aircraft["mode"], leg: "final", hand: "left", runway: "27L", frequency: "tower", altitude: 1583}));
    state.aircraft[1].sequence = {number: 2, traffic: "Left Base", followingId: "virgin", runway: "27L", circuit: 0, followingCircuit: 0};
    const command: Instruction = {type: "pattern", leg: "downwind", hand: "left", runway: "27L", sequence: {number: 3, traffic: "Final"}};
    const result = e.applyEnvelope(state, {id: `swiss-command-${++serial}`, time: serial, action: {kind: "command", aircraftId: "swiss", frequency: "tower", command, text: "Enter left downwind runway 27L, number 3, traffic final"}});
    assert.equal(result.error, undefined); state = result.state;
    assert.equal(state.aircraft[2].sequence?.followingId, "airfrance");
    const commandId = state.messages.at(-1)!.id;
    if (automatic) {
      state.elapsed += 2;
      state = e.autoReadbacks(state, ++serial, () => `swiss-readback-${++serial}`);
    } else {
      const assigned = e.applyEnvelope(state, {id: `swiss-assign-${++serial}`, time: serial, action: {kind: "pilot", aircraftId: "swiss", replyTo: commandId, assign: true, text: "Number 3"}});
      assert.equal(assigned.error, undefined); state = assigned.state;
    }
    assert.equal(state.aircraft[2].mode, "pattern");
    assert.equal(state.aircraft[2].sequence?.followingId, "airfrance", "readback must keep the selected predecessor");
    state = e.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    assert.deepEqual(state.aircraft.slice(0, 3).map(a => e.arrivalNumber(a, state.aircraft)), [1, 2, 3]);
    const landed = {...state, aircraft: state.aircraft.map(a => a.id === "virgin" ? {...a, mode: "rollout" as const} : a)};
    assert.equal(e.followedAircraft(landed.aircraft[2], landed.aircraft)?.id, "airfrance", "Virgin landing cannot cancel Swiss's link to Air France");
  }
});
