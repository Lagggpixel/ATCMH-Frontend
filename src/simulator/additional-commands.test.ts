import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {instructionText, messageMenu} from "./catalog";
import {AIRPORT, advance, applyEnvelope, autoReadbacks, distance, initialExercise, predictAircraft, restoreExercise, runwayExitRoute, runwayGeometry, validateAssignment} from "./engine";
import {pendingCommands, type Action, type Exercise, type Instruction} from "./model";
import {envelopeSchema, exerciseSchema} from "./protocol";
import {buildTaxiGraph} from "./taxi-routing";

function act(state: Exercise, action: Action): Exercise {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
}
function assign(state: Exercise, command: Instruction, index = 1): Exercise {
  return act(state, {kind: "maneuver", aircraftId: state.aircraft[index].id, command});
}
function tick(state: Exercise, seconds: number): Exercise {
  for (let i = 0; i < seconds; i += 1) state = advance(state, Math.min(1, seconds - i));
  return state;
}
const running = () => ({...initialExercise(), running: true});
const restore = (state: Exercise) => restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));

test("contact choices exclude the tuned frequency without mutating other aircraft menus", () => {
  const state = initialExercise();
  for (const a of state.aircraft) {
    const menu = messageMenu(a.frequency!, a).find(e => e.label === "Contact Other Frequency")!;
    assert.equal(menu.children?.length, 2);
    assert.ok(menu.children?.every(e => e.instruction?.type === "frequency" && e.instruction.frequency !== a.frequency));
    assert.ok(menu.children?.every(e => e.instruction?.type === "frequency" && !e.instruction.whenReady));
  }
  assert.equal(messageMenu("ground", state.aircraft[1]).find(e => e.label === "Contact Other Frequency")!.children![0].instruction?.type, "frequency");
});

test("every Misc message sends text, requires no readback and leaves aircraft assignments untouched", () => {
  for (const frequency of ["ground", "tower"] as const) {
    const state = {...running(), autoReadback: true}, a = state.aircraft[frequency === "ground" ? 1 : 0];
    const entries = messageMenu(frequency, a).find(e => e.label === "Misc. Messages")!.children!;
    assert.ok(entries.length >= 24);
    for (const entry of entries) {
      assert.equal(entry.note, undefined); assert.equal(entry.instruction?.type, "radio");
      const command = entry.instruction!;
      const action: Action = {kind: "command", aircraftId: a.id, command, frequency, text: instructionText(a, command)};
      assert.ok(envelopeSchema.safeParse({id: "misc", time: 1, action}).success);
      const next = act(state, action);
      assert.deepEqual(next.aircraft, state.aircraft);
      assert.equal(next.messages[0].autoReadbackAt, undefined);
      assert.deepEqual(pendingCommands(next, a.id), []);
      assert.equal(autoReadbacks(advance(next, 2), 2000, randomUUID).messages.length, 1);
    }
  }
  assert.equal(envelopeSchema.safeParse({id: "empty", time: 1, action: {kind: "command", aircraftId: "demo-air", frequency: "tower", text: "", command: {type: "radio", message: "misc"}}}).success, false);
});

test("transition menu uses 500-foot intervals and assignments climb without a landing or forced descent", () => {
  let state = running(); const a = state.aircraft[0], heading = a.heading;
  a.clearedToLand = true;
  const entries = messageMenu("tower", a).find(e => e.label === "Respond to Transition")!.children!;
  assert.deepEqual(entries.map(e => e.instruction && "altitude" in e.instruction ? e.instruction.altitude : 0), Array.from({length: 20}, (_, i) => (i + 1) * 500));
  const command: Instruction = {type: "transition", altitude: 3000};
  assert.equal(instructionText(a, command), "Speedbird 124, Transition approved at or above 3000 feet");
  state = assign(state, command, 0);
  assert.equal(state.aircraft[0].mode, "heading"); assert.equal(state.aircraft[0].clearedToLand, false);
  const original = structuredClone(state), predicted = predictAircraft(state.aircraft, 1);
  assert.deepEqual(state, original, "prediction must not mutate the saved aircraft");
  assert.deepEqual(predicted.map(a => a.position), advance(state, 1).aircraft.map(a => a.position));
  state = tick(restore(state), 180);
  assert.equal(state.aircraft[0].altitude, 3000); assert.ok(Math.abs(state.aircraft[0].heading - heading) < 1e-8);
  state = assign(state, {type: "transition", altitude: 500}, 0);
  assert.equal(tick(state, 30).aircraft[0].altitude, 3000, "an at-or-above clearance must never descend to a lower minimum");
  assert.match(validateAssignment(state.aircraft[1], command)!, /airborne/);
});

test("departure approval leaves the circuit on each requested cardinal heading and cancels landing", () => {
  for (const [direction, heading] of [["north", 0], ["east", 90], ["south", 180], ["west", 270]] as const) {
    const state = running(); state.aircraft[0].clearedToLand = true;
    const next = tick(assign(state, {type: "departure", direction}, 0), 120);
    assert.equal(next.aircraft[0].mode, "heading"); assert.equal(next.aircraft[0].heading, heading);
    assert.equal(next.aircraft[0].clearedToLand, false); assert.equal(next.aircraft[0].altitude, state.aircraft[0].altitude);
    assert.match(validateAssignment(state.aircraft[1], {type: "departure", direction})!, /airborne/);
  }
});

test("departing and transitioning traffic cannot keep another aircraft extending downwind", () => {
  for (const command of [{type: "departure", direction: "east"}, {type: "transition", altitude: 2000}] as const) {
    let state = running(); const leader = state.aircraft[0], follower = state.aircraft[1];
    Object.assign(follower, {...structuredClone(leader), id: follower.id, callsign: follower.callsign, leg: "downwind", sequence: {number: 2, followingId: leader.id, runway: "24", circuit: 0, followingCircuit: 0}});
    state = assign(state, command, 0);
    assert.equal(state.aircraft[1].sequence, undefined);
    state = restore(state);
    state = assign(state, {type: "sequence", number: 2, traffic: "Final"}, 1);
    assert.equal(state.aircraft[1].sequence, undefined, "departures must not be selected as arrivals");
    state = assign(state, {type: "pattern", leg: "final"}, 0);
    assert.equal(state.aircraft[0].leavingCircuit, undefined);
    state = assign(state, {type: "sequence", number: 2, traffic: "Final"}, 1);
    assert.equal(state.aircraft[1].sequence?.followingId, leader.id);
  }
});

test("line up and wait reaches the mapped runway entry, aligns and stays stopped until takeoff is assigned", () => {
  for (const runway of ["24", "06"] as const) {
    let state = running(); const g = runwayGeometry(runway), a = state.aircraft[1];
    const graph = buildTaxiGraph(AIRPORT), hold = [...graph.holds].sort((x, y) => distance(graph.points[x], g.threshold) - distance(graph.points[y], g.threshold))[0];
    a.position = {...graph.points[hold]}; a.frequency = "tower"; a.runway = runway;
    state = assign(state, {type: "lineup", runway});
    state = tick(restore(state), 180);
    const waiting = state.aircraft[1];
    assert.equal(waiting.mode, "lineup"); assert.equal(waiting.holding, true);
    assert.equal(waiting.speed, 0); assert.equal(waiting.altitude, AIRPORT.elevation);
    assert.deepEqual(waiting.position, waiting.taxiPath.at(-1)); assert.equal(waiting.heading, g.heading);
    assert.deepEqual(tick({...state, running: false}, 60), {...state, running: false});
    state = assign(state, {type: "takeoff", runway});
    state = tick(state, 85);
    assert.ok(state.aircraft[1].altitude > AIRPORT.elevation + 300);
    assert.ok(["pattern", "takeoff"].includes(state.aircraft[1].mode));
  }
});

test("runway exits follow mapped connectors on the requested side and stop clear of both runway ends", () => {
  for (const runway of ["24", "06"] as const) for (const side of ["left", "right", "any"] as const) {
    let state = {...running(), autoReadback: false}; const a = state.aircraft[1], g = runwayGeometry(runway);
    a.position = {x: g.threshold.x + g.vector.x * .1, y: g.threshold.y + g.vector.y * .1};
    a.runway = runway; a.heading = g.heading; a.targetHeading = g.heading; a.frequency = "tower";
    const route = runwayExitRoute(a, side);
    // Some runway sides have no mapped exits; they must be rejected without fabricating a path.
    if (route.error) {assert.match(validateAssignment(a, {type: "exit-runway", side})!, /No reachable mapped/); continue;}
    assert.ok(route.path!.length >= 3);
    state = tick(assign(state, {type: "exit-runway", side}), 600);
    const exited = state.aircraft[1], lateral = (exited.position.x - g.threshold.x) * -g.vector.y + (exited.position.y - g.threshold.y) * g.vector.x;
    assert.equal(exited.mode, "parked"); assert.equal(exited.speed, 0); assert.ok(Math.abs(lateral) >= .059);
    if (side !== "any") assert.equal(Math.sign(lateral), side === "left" ? 1 : -1);
    assert.equal(exited.frequency, "tower");
  }
  assert.match(validateAssignment(initialExercise().aircraft[0], {type: "exit-runway", side: "any"})!, /ground/);
  assert.match(validateAssignment(initialExercise().aircraft[1], {type: "exit-runway", side: "any"})!, /on the runway/);
});

test("a rollout slows before taking a mapped exit and preserves the route through snapshot recovery", () => {
  let state = running(); const a = state.aircraft[1], g = runwayGeometry();
  a.position = {...g.threshold}; a.heading = g.heading; a.targetHeading = g.heading;
  a.mode = "rollout"; a.speed = 100; a.targetSpeed = 0;
  const route = runwayExitRoute(a, "any"); assert.equal(route.error, undefined);
  state = assign(state, {type: "exit-runway", side: "any", expedite: true, traffic: "final"});
  state = restore(tick(state, 10)); assert.equal(state.aircraft[1].mode, "rollout");
  state = tick(state, 600);
  assert.equal(state.aircraft[1].mode, "parked");
  assert.ok(distance(state.aircraft[1].position, route.path!.at(-1)!) < .001);
});
