import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {instructionText, messageMenu, pilotRequests, pilotRequestText, resolvePilotRequest} from "./catalog";
import {advance, AIRPORT, applyEnvelope, autoReadbacks, initialExercise, predictAircraft, readbackText, restoreExercise, runwayGeometry} from "./engine";
import {pendingCommands, type Action, type Exercise, type Instruction, type PilotRequestSelection} from "./model";
import {envelopeSchema, exerciseSchema, menteeActionAllowed} from "./protocol";
import {createScenarioExercise, scenarioFromExercise} from "./scenarios";
import {executeScenarioEvent} from "./scenario-engine";
import {MemoryStore} from "./session-test-store";
import {SessionService} from "./server/session-service";

function act(state: Exercise, action: Action) {
  const envelope = envelopeSchema.parse({id: randomUUID(), time: 1000, action});
  const result = applyEnvelope(state, envelope); assert.equal(result.error, undefined); return result.state;
}
function send(state: Exercise, command: Instruction, aircraftId = "demo-air") {
  const a = state.aircraft.find(a => a.id === aircraftId)!;
  return act(state, {kind: "command", aircraftId, command, text: instructionText(a, command), frequency: a.frequency!});
}
const tick = (state: Exercise, seconds = 1.5) => autoReadbacks(advance(state, seconds), 2000, randomUUID);
const active = () => ({...initialExercise(), running: true, autoReadback: true});
function request(state: Exercise, selection: PilotRequestSelection, aircraftId = "demo-air") {
  return act(state, {kind: "pilot", aircraftId, text: "Replaced with current server phraseology", request: selection});
}
function threshold(autoReadback: boolean) {
  const state = {...initialExercise(), running: true, autoReadback};
  const a = state.aircraft[0], g = runwayGeometry();
  Object.assign(a, {position: {...g.threshold}, heading: g.heading, altitude: AIRPORT.elevation, speed: 135});
  return state;
}

test("airborne directional departure requests and mentee approvals cover all four directions", () => {
  for (const [direction, heading] of [["north", 0], ["east", 90], ["south", 180], ["west", 270]] as const) {
    let state = active(); state.aircraft[0].callsign = "Easy 201";
    state = request(state, {id: "departure-direction", runway: "24", direction});
    assert.equal(state.messages[0].text, `Easy 201, requesting departure to the ${direction}`);
    const command: Instruction = {type: "departure", direction};
    assert.ok(menteeActionAllowed({kind: "command", aircraftId: "demo-air", command, frequency: "tower", text: ""}));
    state = tick(send(state, command));
    assert.equal(state.messages[1].text, `Easy 201, departure to the ${direction} approved`);
    assert.equal(state.messages[2].text, `departure to the ${direction} approved, Easy 201`);
    assert.equal(state.aircraft[0].targetHeading, heading); assert.equal(state.aircraft[0].leavingCircuit, true);
  }
  assert.ok(!pilotRequests(initialExercise().aircraft[1]).some(r => r.id === "departure-direction"));
});

test("pushback and both taxi variants use the latest broadcast, never the unpublished ATIS draft", () => {
  let state = active(); state.aircraft[1].callsign = "Easy 201";
  state.atis.letter = "BRAVO"; state = act(state, {kind: "publish-atis"}); state.atis.letter = "CHARLIE";
  for (const id of ["pushback", "taxi-runway"] as const) {
    const next = request(state, {id, runway: "06"}, "demo-ground");
    assert.equal(next.messages.at(-1)!.text, `Easy 201, ready ${id === "pushback" ? "for pushback" : "to taxi to runway 06"} with information BRAVO`);
    assert.equal(next.aircraft[1].mode, "parked"); assert.equal(next.aircraft[1].runway, "24");
  }
  state = request(state, {id: "taxi-runway", runway: "06", includeRunway: false}, "demo-ground");
  assert.equal(state.messages.at(-1)!.text, "Easy 201, ready to taxi with information BRAVO");
  const noAtis = initialExercise();
  assert.equal(pilotRequestText(noAtis.aircraft[1], resolvePilotRequest({requestId: "pushback"})!, "24", false, {exercise: noAtis}), "Easy 571, ready for pushback");
});

test("crossing, hold-short, taxi and contact use action-specific pilot readbacks", () => {
  for (const [command, expected] of [
    [{type: "cross", runway: "06"}, "Crossing runway 06"],
    [{type: "hold-short", runway: "06"}, "Holding short runway 06"],
    [{type: "taxi", runway: "24"}, "Taxi to runway 24, contact tower when ready"],
    [{type: "frequency", frequency: "tower"}, "Contacting Edinburgh Tower on 118.70"],
  ] as const) {
    let state = active(); const a = state.aircraft[1];
    if (command.type === "cross" || command.type === "hold-short") {
      a.mode = "taxi"; a.holding = true; a.taxiIndex = 0; a.taxiPath = [{...a.position, hold: true}, {x: a.position.x + .1, y: a.position.y}];
    }
    state = tick(send(state, command, a.id));
    assert.equal(state.messages.at(-1)!.text, `${expected}, Easy 571`);
    assert.equal(state.messages.at(-1)!.frequency, "ground");
  }
});

test("takeoff readbacks omit wind and retain the runway, traffic hand and callsign", () => {
  for (const hand of [undefined, "right", "left"] as const) {
    let state = active(); const a = state.aircraft[1]; a.frequency = "tower";
    const command: Instruction = {type: "takeoff", runway: "24", ...(hand ? {hand} : {})};
    const clearance = instructionText(a, command);
    assert.match(clearance, /^Easy 571, wind 240 at 10, Runway 24, cleared for takeoff/);
    const expected = `Runway 24, cleared for takeoff${hand ? `, make ${hand} traffic` : ""}, Easy 571`;
    assert.equal(readbackText(a.callsign, clearance, command), expected);
    assert.equal(readbackText(a.callsign, `Runway 24, cleared for takeoff${hand ? `, make ${hand} traffic` : ""}`, command), expected);
    state = tick(send(state, command, a.id));
    assert.equal(state.messages.at(-1)!.text, expected);
    assert.equal(state.messages.at(-1)!.frequency, "tower");
  }
});

test("Stay on frequency stays silent; frequency release replies once on the original channel", () => {
  let state = active();
  const entries = messageMenu("tower", state.aircraft[0]);
  const stay = entries.find(e => e.label === "Misc. Messages")!.children!.find(e => e.label === "Stay on frequency")!.instruction!;
  state = tick(send(state, stay));
  assert.equal(state.messages[0].text, "Speedbird 124, stay on my frequency"); assert.equal(state.messages.length, 1);
  state = send(state, {type: "frequency", frequency: null});
  const commandId = state.messages.at(-1)!.id;
  state = tick(state, 1.4); assert.equal(state.aircraft[0].frequency, "tower"); assert.equal(state.messages.length, 2);
  state = tick(state, .1);
  assert.equal(state.aircraft[0].frequency, null); assert.equal(state.messages.length, 3);
  assert.equal(state.messages.at(-1)!.text, "Frequency change approved, good day, Speedbird 124");
  assert.equal(state.messages.at(-1)!.frequency, "tower");
  assert.equal(state.messages.at(-1)!.commandId, commandId);
  assert.equal(state.messages.at(-1)!.read, true);
  assert.equal(pendingCommands(state, "demo-air").length, 0);
  state = restoreExercise(exerciseSchema.parse(state)); assert.equal(tick(state).messages.length, 3);
});

test("manual frequency release permits readback and assignment, while Unable retains the frequency", () => {
  for (const assign of [false, true]) {
    let state = send({...active(), autoReadback: false}, {type: "frequency", frequency: null});
    const commandId = state.messages.at(-1)!.id;
    state = act(state, {kind: "pilot", aircraftId: "demo-air", replyTo: commandId, assign, text: "Frequency change approved, good day, Speedbird 124"});
    assert.equal(state.messages.length, 2);
    assert.equal(state.messages.at(-1)!.frequency, "tower");
    assert.equal(state.aircraft[0].frequency, assign ? null : "tower");
    assert.equal(pendingCommands(state, "demo-air").length, 0);
  }
  let state = send({...active(), autoReadback: false}, {type: "frequency", frequency: null});
  state = act(state, {kind: "pilot", aircraftId: "demo-air", replyTo: state.messages.at(-1)!.id, text: "Unable, Speedbird 124"});
  assert.equal(state.aircraft[0].frequency, "tower"); assert.equal(state.messages.at(-1)!.text, "Unable, Speedbird 124");
});

test("staff Go Around starts a manoeuvre; each mentee response reads back and executes its direction", () => {
  for (const label of ["Make Right Traffic", "Make Left Traffic", "Fly Runway Heading"]) {
    let state = active(); state.aircraft[0].callsign = "Easy 201"; state.aircraft[0].clearedToLand = true;
    state = request(state, {id: "go-around", runway: "24"});
    assert.equal(state.messages[0].text, "Easy 201, going around");
    assert.equal(state.aircraft[0].mode, "go-around"); assert.equal(state.aircraft[0].clearedToLand, false);
    const command = messageMenu("tower", state.aircraft[0]).find(e => e.label === "Respond to Go Around")!.children!.find(e => e.label === label)!.instruction!;
    state = tick(send(state, command));
    const phrase = label === "Fly Runway Heading" ? "fly runway heading" : label === "Make Right Traffic" ? "make right traffic" : "make left traffic";
    assert.equal(state.messages[1].text, `Easy 201, go around, ${phrase} runway 24`);
    assert.equal(state.messages[2].text, `go around, ${phrase} runway 24, Easy 201`);
    assert.equal(state.aircraft[0].circuit, 1, "the controller response does not start another circuit");
    for (let i = 0; i < 120; i++) state = advance(state, 5);
    if (label === "Fly Runway Heading") {assert.equal(state.aircraft[0].mode, "go-around"); assert.equal(state.aircraft[0].targetHeading, runwayGeometry().heading);}
    else assert.equal(state.aircraft[0].hand, label === "Make Right Traffic" ? "right" : "left");
  }
});

test("no landing clearance triggers one self go-around only with automation enabled; prediction emits no messages", () => {
  const original = threshold(true), predicted = predictAircraft(original.aircraft, .1, true);
  let state = advance(original, .1);
  assert.equal(state.messages.length, 0); assert.equal(state.aircraft[0].mode, "go-around");
  assert.deepEqual(predicted[0].position, state.aircraft[0].position); assert.equal(original.aircraft[0].mode, "pattern");
  state = autoReadbacks(restoreExercise(exerciseSchema.parse(state)), 1000, randomUUID);
  assert.equal(state.messages[0].text, "Speedbird 124, going around"); assert.equal(state.messages[0].read, false); assert.equal(state.aircraft[0].pending, 1);
  assert.equal(tick(state).messages.length, 1);
  const manual = tick(threshold(false), .1);
  assert.equal(manual.aircraft[0].mode, "pattern"); assert.equal(manual.aircraft[0].leg, "upwind"); assert.equal(manual.messages.length, 0);
});

test("landing without option forces full stop even after a staff touch-and-go override", () => {
  let state = act(threshold(false), {kind: "maneuver", aircraftId: "demo-air", command: {type: "land"}});
  state = act(state, {kind: "maneuver", aircraftId: "demo-air", command: {type: "outcome", outcome: "touch-and-go"}});
  for (let i = 0; i < 15; i++) state = advance(state, 5);
  assert.ok(["rollout", "taxi", "parked"].includes(state.aircraft[0].mode)); assert.equal(state.aircraft[0].altitude, AIRPORT.elevation); assert.equal(state.aircraft[0].landing, "full-stop");
  assert.equal(state.aircraft[0].clearedToLand, false); assert.equal(state.aircraft[0].clearedForOption, false);
});

test("option permits touch-and-go once and clears permission and option hand before the next circuit", () => {
  let state = act(threshold(true), {kind: "maneuver", aircraftId: "demo-air", command: {type: "land", option: true, hand: "right"}});
  state = advance(state, .1);
  assert.equal(state.aircraft[0].mode, "takeoff"); assert.equal(state.aircraft[0].hand, "right");
  assert.equal(state.aircraft[0].clearedToLand, false); assert.equal(state.aircraft[0].clearedForOption, false); assert.equal(state.aircraft[0].optionHand, undefined);
  const a = state.aircraft[0]; Object.assign(a, {mode: "pattern", leg: "final", position: runwayGeometry().threshold, altitude: AIRPORT.elevation});
  state = tick(state, .1); assert.equal(state.aircraft[0].mode, "go-around"); assert.equal(state.messages.length, 1);
});

test("runway changes, cancellation and circuit wrap revoke both permissions; late clearances cannot be assigned", () => {
  for (const command of [{type: "runway", runway: "06"}, {type: "cancel-landing"}, {type: "pattern", leg: "upwind"}] as const) {
    let state = act(threshold(false), {kind: "maneuver", aircraftId: "demo-air", command: {type: "land", option: true, hand: "right"}});
    state = act(state, {kind: "maneuver", aircraftId: "demo-air", command});
    assert.equal(state.aircraft[0].clearedToLand, false); assert.equal(state.aircraft[0].clearedForOption, false); assert.equal(state.aircraft[0].optionHand, undefined);
  }
  let state = send(threshold(true), {type: "land", option: true});
  state = tick(state);
  assert.equal(state.aircraft[0].clearedToLand, false);
  assert.match(state.messages.at(-1)!.text, /previous circuit/);
});

test("scheduled directional requests preserve choices; scheduled go-around has the same staff behavior", () => {
  const definition = scenarioFromExercise(initialExercise(), "Pilot interactions");
  definition.events = [{id: "departure", title: "Departure", trigger: {type: "manual"}, actions: [{type: "request", aircraftKey: "aircraft-1", requestId: "departure-direction", runway: "24", direction: "west"}]},
    {id: "go", title: "Go Around", trigger: {type: "manual"}, actions: [{type: "request", aircraftKey: "aircraft-1", requestId: "go-around", runway: "24"}]}];
  const {exercise, runtime} = createScenarioExercise(definition, "session", randomUUID());
  let state = executeScenarioEvent(exercise, runtime, "departure", 1000);
  assert.equal(state.messages[0].text, "Speedbird 124, requesting departure to the west");
  state = executeScenarioEvent(state, runtime, "go", 2000);
  assert.equal(state.aircraft[0].mode, "go-around"); assert.equal(state.messages[1].text, "Speedbird 124, going around");
});

test("shared session publishes the automatic self-go-around as content to both seats", async () => {
  let now = 1000; const store = new MemoryStore(), service = new SessionService(store, () => now);
  const staff = {accountId: "staff", staff: true}, mentee = {accountId: "mentee", staff: false};
  const session = await service.create(staff, "Clearance"), control = randomUUID(), student = randomUUID();
  await service.join(staff, session.id, "staff", control); await service.join(mentee, session.id, "mentee", student);
  const record = store.records.get(session.id)!; record.exercise = {...threshold(true), id: session.id};
  const before = record.contentRevision; now += 100;
  const frame = await service.frame(mentee, session.id, "mentee", student);
  assert.ok(frame.contentRevision > before); assert.equal(frame.exercise.messages[0].text, "Speedbird 124, going around");
  assert.deepEqual((await service.frame(staff, session.id, "staff", control)).exercise, frame.exercise);
});
