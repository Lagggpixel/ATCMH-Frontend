import assert from "node:assert/strict";
import test from "node:test";
import {advance, AIRPORT, applyEnvelope, initialExercise, newAircraft, patternTargets, runwayGeometry, validateAssignment, validateInstruction} from "./engine";
import {aircraftColor, stripRunway, type Action, type Exercise, type Instruction} from "./model";
import {contextMenu, instructionText, commandTasks, pilotRequests, pilotRequestText} from "./catalog";
import {envelopeSchema, exerciseSchema, menteeActionAllowed} from "./protocol";
import {simulatorEnabled} from "./feature";
let sequence = 0;
function act(state: Exercise, action: Action, id = `test-${++sequence}`) {const result = applyEnvelope(state, {id, time: 1791540000000, action}); assert.equal(result.error, undefined); return result.state;}
const maneuver = (state: Exercise, command: Instruction) => act(state, {kind: "maneuver", aircraftId: "demo-air", command});

test("prototype defaults off and accepts only an explicit true flag", () => {
  for (const flag of [undefined, "", "false", "1", "TRUE"]) assert.equal(simulatorEnabled({SIMULATOR_ENABLED: flag}), false);
  assert.equal(simulatorEnabled({SIMULATOR_ENABLED: "true"}), true);
});
test("bundled airport contains OSM features, attributed metadata and real thresholds", () => {
  assert.equal(AIRPORT.icao, "EGPH"); assert.ok(AIRPORT.features.length > 100); assert.match(AIRPORT.osmAttribution, /OpenStreetMap/);
  assert.equal(AIRPORT.runway.ends.length, 2); assert.ok(AIRPORT.features.some(f => f.kind === "taxiway"));
  assert.equal(exerciseSchema.safeParse(initialExercise()).success, true);
});
test("only current frequency determines default aircraft color", () => {
  const a = newAircraft("a", true); assert.equal(aircraftColor(a, "tower"), "#80dce8"); assert.equal(aircraftColor(a, "ground"), "#808080");
  a.frequency = null; assert.equal(aircraftColor(a, "tower"), "#808080"); a.color = "#ffffff"; assert.equal(aircraftColor(a, "tower"), "#ffffff");
});
test("runway strip uses assigned, last interacted, then placeholder", () => {
  const a = newAircraft("a", true); a.lastRunway = "06"; assert.equal(stripRunway(a), "24"); a.runway = null; assert.equal(stripRunway(a), "06"); a.lastRunway = null; assert.equal(stripRunway(a), "----");
});
test("instructions validate frequency, state and numeric input", () => {
  const a = newAircraft("a", true), ground = newAircraft("b", false);
  assert.match(validateInstruction(a, {type: "land"}, "ground")!, /not on/);
  assert.equal(validateInstruction(a, {type: "taxi"}), null);
  assert.match(validateAssignment(a, {type: "taxi"})!, /ground/);
  assert.match(validateAssignment(ground, {type: "heading", value: 90})!, /airborne/);
  assert.match(validateInstruction(a, {type: "speed", value: NaN})!, /valid/);
  assert.match(validateInstruction(a, {type: "speed", value: 601})!, /valid/);
  assert.match(validateInstruction(a, {type: "heading", value: -1})!, /valid/);
});
test("taxi and crossing require configured paths and hold-short points", () => {
  const a = newAircraft("a", false); assert.match(validateAssignment(a, {type: "taxi"})!, /path/);
  a.taxiPath = [{x: 0, y: 0}, {x: 0.1, y: 0}]; assert.match(validateAssignment(a, {type: "hold-short"})!, /no upcoming/);
  assert.match(validateAssignment(a, {type: "cross"})!, /no upcoming runway crossing/);
});
test("taxi stops at marked hold, crossing releases it once, and path end parks traffic", () => {
  let state = initialExercise(); const a = state.aircraft[1]; a.position = {x: 0, y: 0}; a.heading = 90;
  a.taxiPath = [{x: 0.02, y: 0, hold: true}, {x: 0.05, y: 0}]; a.taxiIndex = 0;
  state = act(state, {kind: "maneuver", aircraftId: a.id, command: {type: "taxi"}}); state.running = true;
  for (let i = 0; i < 20; i++) state = advance(state, 1);
  assert.equal(state.aircraft[1].holding, true); assert.equal(state.aircraft[1].speed, 0); assert.equal(state.aircraft[1].taxiIndex, 0);
  state = act(state, {kind: "maneuver", aircraftId: a.id, command: {type: "cross"}});
  for (let i = 0; i < 20; i++) state = advance(state, 1);
  assert.equal(state.aircraft[1].mode, "parked"); assert.equal(state.aircraft[1].taxiIndex, 2);
});
test("heading overrides survive runway changes until explicit pattern instruction", () => {
  let state = maneuver(initialExercise(), {type: "heading", value: 90});
  const before = {...state.aircraft[0].position}; state = maneuver(state, {type: "runway", runway: "06"});
  assert.equal(state.aircraft[0].mode, "heading"); assert.equal(state.aircraft[0].targetHeading, 90); assert.deepEqual(state.aircraft[0].position, before); assert.equal(state.aircraft[0].leg, "final");
  state = maneuver(state, {type: "pattern", leg: "downwind", hand: "right"}); assert.equal(state.aircraft[0].mode, "pattern"); assert.equal(state.aircraft[0].hand, "right");
});
test("pattern extensions suppress automatic turns and new instructions release them", () => {
  let state = maneuver(initialExercise(), {type: "extend", leg: "downwind"}); state.running = true;
  for (let i = 0; i < 180; i++) state = advance(state, 1);
  assert.equal(state.aircraft[0].leg, "downwind"); assert.equal(state.aircraft[0].extended, true);
  state = maneuver(state, {type: "pattern", leg: "base"}); assert.equal(state.aircraft[0].extended, false); assert.equal(state.aircraft[0].leg, "base");
});
test("all five pattern legs advance continuously without a clearance", () => {
  let state = initialExercise(); state.aircraft[0].position = {...patternTargets(state.aircraft[0]).upwind}; state.aircraft[0].leg = "upwind"; state.running = true;
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {state = advance(state, 1); seen.add(state.aircraft[0].leg);}
  assert.deepEqual([...seen].sort(), ["base", "crosswind", "downwind", "final", "upwind"]);
});
test("full-stop landing rolls out; touch-and-go climbs back into pattern", () => {
  for (const landing of ["full-stop", "touch-and-go"] as const) {
    let state = initialExercise(); const a = state.aircraft[0]; const g = runwayGeometry(); a.position = {...g.threshold}; a.altitude = AIRPORT.elevation; a.speed = 140; a.heading = g.heading; a.landing = landing; a.clearedToLand = true; a.clearedForOption = landing === "touch-and-go"; state.running = true;
    for (let i = 0; i < 90; i++) state = advance(state, 1);
    assert.equal(state.aircraft[0].clearedToLand, false);
    if (landing === "full-stop") {assert.ok(["rollout", "taxi", "parked"].includes(state.aircraft[0].mode)); assert.equal(state.aircraft[0].altitude, AIRPORT.elevation); assert.equal(state.aircraft[0].landing, "full-stop");} else {assert.equal(state.aircraft[0].mode, "pattern"); assert.ok(state.aircraft[0].altitude > AIRPORT.elevation + 300);}
  }
});
test("go-around removes landing clearance and respects requested pattern hand", () => {
  let state = initialExercise(); state.aircraft[0].clearedToLand = true; state = maneuver(state, {type: "go-around", hand: "right"});
  assert.equal(state.aircraft[0].clearedToLand, false); assert.equal(state.aircraft[0].leg, "upwind"); assert.equal(state.aircraft[0].hand, "right");
});
test("takeoff can be issued before runway placement, while assignment needs a valid ground route", () => {
  let state = initialExercise(); const a = state.aircraft[1]; a.position = {x: 10, y: 10}; assert.equal(validateInstruction(a, {type: "takeoff"}), null); assert.match(validateAssignment(a, {type: "takeoff"})!, /taxiway/);
  a.position = {...runwayGeometry().threshold}; a.frequency = "tower"; state = act(state, {kind: "command", aircraftId: a.id, frequency: "tower", text: "Cleared for takeoff", command: {type: "takeoff"}}); state = act(state, {kind: "pilot", aircraftId: a.id, text: "Cleared for takeoff", replyTo: state.messages.at(-1)!.id, assign: true}); state.running = true;
  for (let i = 0; i < 90; i++) state = advance(state, 1);
  assert.equal(state.aircraft[1].mode, "pattern"); assert.ok(state.aircraft[1].altitude > AIRPORT.elevation);
});
test("pause and fixed substeps preserve deterministic positions", () => {
  const state = initialExercise(); assert.equal(advance(state, 5), state); state.running = true;
  const once = advance(state, 1); let stepped = state; for (let i = 0; i < 10; i++) stepped = advance(stepped, 0.1);
  assert.ok(Math.abs(once.aircraft[0].position.x - stepped.aircraft[0].position.x) < 1e-10);
  assert.ok(Math.abs(once.aircraft[0].position.y - stepped.aircraft[0].position.y) < 1e-10);
});
test("queued commands and plain readbacks do not change aircraft instructions", () => {
  let state = initialExercise(); const action: Action = {kind: "command", aircraftId: "demo-air", frequency: "tower", text: "Turn base", command: {type: "pattern", leg: "base"}};
  state = act(state, action, "command-1"); const duplicate = act(state, action, "command-1"); assert.equal(duplicate, state); assert.equal(state.messages.length, 1);
  state = act(state, {kind: "pilot", aircraftId: "demo-air", text: "Turning base", replyTo: "command-1"}); assert.equal(state.aircraft[0].leg, "final"); assert.equal(state.aircraft[0].pending, 0);
  const replay = applyEnvelope(state, {id: "second-reply", time: 1, action: {kind: "pilot", aircraftId: "demo-air", text: "Turning base", replyTo: "command-1"}}); assert.match(replay.error!, /answered/);
  state = act(state, {kind: "read", aircraftId: "demo-air"}); assert.equal(state.aircraft[0].pending, 0);
});
test("ATIS draft changes do not publish until explicit publication", () => {
  let state = initialExercise(); state = act(state, {kind: "atis", draft: {...state.atis, letter: "BRAVO", remarks: ["NO PATTERN WORK"]}});
  assert.equal(state.publishedAtis, "ATIS UNAVAILABLE"); state = act(state, {kind: "publish-atis"}); assert.match(state.publishedAtis, /BRAVO/); assert.match(state.publishedAtis, /NO PATTERN WORK/);
  state = act(state, {kind: "atis", draft: {...state.atis, letter: "CHARLIE"}}); assert.match(state.publishedAtis, /BRAVO/);
});
test("training tasks retain crossing and ground commands on tower, with typed off-frequency context", () => {
  const a = newAircraft("a", true);
  assert.ok(!contextMenu("ground", a).includes("messages")); assert.ok(contextMenu("tower", a).includes("messages"));
  a.frequency = "ground"; a.mode = "parked";
  for (const frequency of ["ground", "tower"] as const) {
    const tasks = commandTasks(frequency, a);
    for (const id of ["taxi", "continue", "parking", "cross", "hold-short", "stop", "pushback"]) assert.ok(tasks.some(t => t.id === id));
    assert.ok(!tasks.some(t => t.command.type === "pattern"));
  }
  a.mode = "pattern"; assert.ok(commandTasks("tower", a).some(t => t.id === "pattern"));
  assert.deepEqual(commandTasks("atis", a), []);
});

test("go-around follows runway heading while climbing before resuming its pattern", () => {
  let state = initialExercise(); state.aircraft[0].altitude = AIRPORT.elevation + 100;
  state = maneuver(state, {type: "go-around", hand: "right"}); state.running = true;
  state = advance(state, 1);
  assert.equal(state.aircraft[0].mode, "go-around");
  assert.equal(state.aircraft[0].targetHeading, runwayGeometry().heading);
  assert.ok(state.aircraft[0].altitude > AIRPORT.elevation + 100);
  for (let i = 0; i < 300 && state.aircraft[0].mode === "go-around"; i++) state = advance(state, 1);
  assert.equal(state.aircraft[0].mode, "pattern"); assert.equal(state.aircraft[0].hand, "right");
});

test("composed operational messages omit menu breadcrumbs and Send labels", () => {
  const a = newAircraft("a", true);
  assert.equal(instructionText(a, {type: "land", option: true}), "Speedbird 124, wind 240 at 10, runway 24, cleared for the option");
  assert.equal(instructionText(a, {type: "frequency", frequency: "ground"}), "Speedbird 124, contact Edinburgh Ground on 121.75");
});
test("wire validation rejects invalid values and mentee staff-only actions", () => {
  assert.equal(envelopeSchema.safeParse({id: "a", time: 1, action: {kind: "edit", aircraftId: "b", patch: {speed: -1}}}).success, false);
  assert.equal(envelopeSchema.safeParse({id: "a", time: 1, action: {kind: "edit", aircraftId: "b", patch: {id: "replacement"}}}).success, false);
  assert.equal(menteeActionAllowed({kind: "pause"}), false); assert.equal(menteeActionAllowed({kind: "edit", aircraftId: "a", patch: {position: {x: 0, y: 0}}}), false);
  assert.equal(menteeActionAllowed({kind: "edit", aircraftId: "a", patch: {color: "#ffffff"}}), true);
  assert.equal(menteeActionAllowed({kind: "command", aircraftId: "a", command: {type: "heading", value: 90}, frequency: "tower", text: "Turn"}), false);
});

const queuedTurn = (): Exercise => act(initialExercise(), {kind: "command", aircraftId: "demo-air", frequency: "tower", text: "Turn base", command: {type: "pattern", leg: "base"}}, "queued-turn");
test("readback and assign executes its stored instruction once and survives wire snapshots", () => {
  const queued = exerciseSchema.parse(queuedTurn());
  assert.equal(queued.aircraft[0].leg, "final");
  const response: Action = {kind: "pilot", aircraftId: "demo-air", text: "Turning base", replyTo: "queued-turn", assign: true};
  const assigned = act(queued, response, "assignment");
  assert.equal(assigned.aircraft[0].leg, "base"); assert.equal(assigned.aircraft[0].pending, 0);
  assert.equal(act(assigned, response, "assignment"), assigned);
  assert.match(applyEnvelope(assigned, {id: "second-assignment", time: 1, action: response}).error!, /answered/);
});
test("Unable declines without executing; assignment requires a valid unanswered instruction", () => {
  const queued = queuedTurn();
  const declined = act(queued, {kind: "pilot", aircraftId: "demo-air", text: "Unable", replyTo: "queued-turn"});
  assert.equal(declined.aircraft[0].leg, "final");
  assert.match(applyEnvelope(queued, {id: "no-command", time: 1, action: {kind: "pilot", aircraftId: "demo-air", text: "Readback", assign: true}}).error!, /no pending/);
  queued.aircraft[0].frequency = "ground";
  const result = applyEnvelope(queued, {id: "stale", time: 1, action: {kind: "pilot", aircraftId: "demo-air", text: "Turning base", replyTo: "queued-turn", assign: true}});
  assert.match(result.error!, /answered or superseded/); assert.equal(result.state.messages.length, 1);
});
test("assignment revalidates routes and logs a frequency-change readback on the original frequency", () => {
  let state = initialExercise();
  state = act(state, {kind: "command", aircraftId: "demo-ground", frequency: "ground", text: "Continue taxi", command: {type: "taxi"}}, "taxi-command");
  state.aircraft[1].taxiPath = [];
  assert.match(applyEnvelope(state, {id: "invalid-route", time: 1, action: {kind: "pilot", aircraftId: "demo-ground", text: "Taxi", replyTo: "taxi-command", assign: true}}).error!, /path/);
  state = act(state, {kind: "command", aircraftId: "demo-air", frequency: "tower", text: "Contact Ground", command: {type: "frequency", frequency: "ground"}}, "frequency-command");
  state = act(state, {kind: "pilot", aircraftId: "demo-air", text: "Contacting Ground", replyTo: "frequency-command", assign: true});
  assert.equal(state.aircraft[0].frequency, "ground"); assert.equal(state.messages.at(-1)!.frequency, "tower");
});
test("pilot requests carry their chosen runway without changing the assigned runway", () => {
  const a = newAircraft("a", true);
  const request = pilotRequests(a).find(r => r.id === "runway-change")!;
  assert.equal(pilotRequestText(a, request, "06"), "Speedbird 124, requesting change to runway 06"); assert.equal(a.runway, "24");
  a.frequency = "ground"; a.mode = "parked";
  assert.equal(pilotRequestText(a, pilotRequests(a)[1], "06"), "Speedbird 124, ready to taxi to runway 06");
  assert.equal(pilotRequestText(a, pilotRequests(a)[0], "06"), "Speedbird 124, ready for pushback");
});
test("unified staff scope shows traffic on both local frequencies in aqua", () => {
  const a = newAircraft("a", true);
  assert.equal(aircraftColor(a, "all"), "#80dce8"); a.frequency = "ground"; assert.equal(aircraftColor(a, "all"), "#80dce8");
  a.frequency = null; assert.equal(aircraftColor(a, "all"), "#808080");
  assert.equal(menteeActionAllowed({kind: "pilot", aircraftId: "a", text: "Readback", replyTo: "c", assign: true}), false);
});

test("takeoff with Make Right Traffic sets the pattern hand and climbs without re-executing readbacks", () => {
  let state = initialExercise(); const a = state.aircraft[1]; a.frequency = "tower"; a.position = runwayGeometry().threshold;
  const task = commandTasks("tower", a).find(t => t.id === "takeoff")!;
  const choice = {instruction: {...task.command, hand: "right"} as Extract<Instruction, {type: "takeoff"}>};
  assert.deepEqual(choice.instruction, {type: "takeoff", runway: "24", hand: "right"});
  const text = instructionText(a, choice.instruction); assert.match(text, /cleared for takeoff, make right traffic/);
  state = act(state, {kind: "command", aircraftId: a.id, frequency: "tower", text, command: choice.instruction!}, "right-traffic");
  assert.equal(state.aircraft[1].hand, "left");
  state = act(state, {kind: "pilot", aircraftId: a.id, text, replyTo: "right-traffic", assign: true});
  assert.equal(state.aircraft[1].mode, "lineup"); assert.equal(state.aircraft[1].hand, "right");
  state.running = true; for (let i = 0; i < 90; i++) state = advance(state, 1);
  assert.equal(state.aircraft[1].mode, "pattern"); assert.equal(state.aircraft[1].hand, "right");
});
