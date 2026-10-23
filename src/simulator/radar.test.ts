import {magneticToTrue, trueToMagnetic} from "./magnetic-headings";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {ALTITUDES, altitudeFeet, altitudeLabel, approachGeometry, radarHeading, radarFlightLabel, vectorPreview, snappedVectorHeading} from "./radar";
import {airportList, controlledFrequencies, defaultRunway, getAirport, openingFrequency, trainingMode} from "./airports";
import {advance, applyEnvelope, autoReadbacks, engineFor, restoreExercise} from "./engine";
import {catalogFor} from "./catalog";
import {altitudeSchema, exerciseSchema, menteeActionAllowed, envelopeSchema} from "./protocol";
import {blankScenario, createScenarioExercise, scenarioSchema, seedFromAircraft} from "./scenarios";
import {advanceScenario} from "./scenario-engine";
import {ReplayTimeline, replayDelta} from "./replays";
import {SessionService} from "./server/session-service";
import {MemoryStore} from "./session-test-store";
import type {Action, Exercise, Instruction} from "./model";

function exercise(mode: "approach" | "center" = "approach"): Exercise {
  const engine = engineFor({trainingStation: `EGPH:${mode}`});
  const state = engine.initialExercise(); state.aircraft = [engine.newAircraft("a", true)];
  state.aircraft[0].callsign = "Speedbird 1"; delete state.aircraft[0].radar!.report;
  state.running = true; state.autoReadback = false; return state;
}
function send(state: Exercise, action: Action) {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
}
const assign = (state: Exercise, command: Instruction) => send(state, {kind: "maneuver", aircraftId: "a", command});
function command(state: Exercise, instruction: Instruction) {
  return send(state, {kind: "command", aircraftId: "a", command: instruction, frequency: openingFrequency(state), text: "Client text is not authoritative"});
}
function fly(state: Exercise, seconds: number, step = 5) {for (let left = seconds; left > 1e-8; left -= Math.min(left, step)) state = advance(state, Math.min(left, step)); return state;}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("label angle persists through session JSON/replay and allows presentation edits only", () => {
  let state = exercise(); const action: Action = {kind: "edit", aircraftId: "a", patch: {tagAngle: 137}};
  assert.ok(menteeActionAllowed(envelopeSchema.parse({id: randomUUID(), time: 0, action}).action, state));
  state = send(state, action); const parsed = exerciseSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.equal(restoreExercise(parsed).aircraft[0].tagAngle, 137);
  assert.equal(menteeActionAllowed({kind: "edit", aircraftId: "a", patch: {tagAngle: 137, altitude: 6000}}, state), false);
  assert.equal(envelopeSchema.safeParse({id: randomUUID(), time: 0, action: {...action, patch: {tagAngle: 361}}}).success, false);
  state = send(state, {kind: "edit", aircraftId: "a", patch: {tag: "left"}}); assert.equal(state.aircraft[0].tagAngle, undefined);
});
test("Ground & Tower uses the same asymmetric climb/descent rates", () => {
  const engine = engineFor({trainingStation: "EGPH:local"}); const state = engine.initialExercise(); state.running = true;
  state.aircraft = [engine.newAircraft("a", true)]; const a = state.aircraft[0], target = getAirport(state).elevation + 1500;
  Object.assign(a, {mode: "heading", leavingCircuit: true, takeoffPattern: false, altitude: target - 1000});
  near(fly(state, 15).aircraft[0].altitude, target - 500);
  a.mode = "pattern"; a.leg = "downwind"; delete a.takeoffPattern; a.altitude = target + 1000; near(fly(state, 20).aircraft[0].altitude, target + 500);
});

for (const mode of ["approach", "center"] as const) for (const step of [.1, 5]) test(`${mode}: climbs at 2000fpm and descends at 1500fpm (${step}s frames)`, () => {
  let state = exercise(mode); state.aircraft[0].altitude = 10000;
  state = assign(state, {type: "vector", altitude: {unit: "feet", value: 14000}});
  near(fly(state, 30, step).aircraft[0].altitude, 11000);
  state = fly(state, 120, step); near(state.aircraft[0].altitude, 14000);
  state = assign(state, {type: "vector", altitude: {unit: "feet", value: 10000}});
  near(fly(state, 30, step).aircraft[0].altitude, 13250);
  near(fly(state, 240, step).aircraft[0].altitude, 10000);
});
test("flight label hides unassigned fields and keeps assignment direction through level-off and replay", () => {
  let state = exercise(); Object.assign(state.aircraft[0], {altitude: 15900, speed: 227});
  const label = () => radarFlightLabel(state.aircraft[0], getAirport(state), state.radarEnvironment);
  assert.deepEqual(label(), {flight: "159 227kts", approach: undefined});
  const p = state.radarEnvironment!.approaches.find(p => p.type === "gps")!;
  state = assign(state, {type: "expect-approach", approachId: p.id});
  state = assign(state, {type: "vector", altitude: {unit: "feet", value: 14000}});
  assert.equal(label().flight, "159 > 140 227kts"); assert.equal(label().approach, `GPS - EGPH ${p.runway}`);
  state = fly(state, 100); assert.match(label().flight, /^140 > 140 /);
  state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state)))); assert.equal(state.aircraft[0].radar!.altitudeAssignedFrom, 15900);
  state = assign(state, {type: "vector", altitude: {unit: "feet", value: 16000}}); assert.match(label().flight, /^140 < 160 /);
  state = assign(state, {type: "vector", altitude: {unit: "feet", value: 14000}}); assert.match(label().flight, /^140 = 140 /);
  state = assign(state, {type: "expect-approach", approachId: null}); assert.equal(label().approach, undefined);
});
for (const mode of ["approach", "center"] as const) for (const automatic of [false, true]) test(`${mode}: RV tags retain the assigned runway through readback and replay (automatic=${automatic})`, () => {
  let state = exercise(mode); state.autoReadback = automatic;
  const airport = getAirport(state), runway = airport.runway.ends.find(end => end.id !== state.aircraft[0].runway)!.id;
  const label = () => radarFlightLabel(state.aircraft[0], airport, state.radarEnvironment).approach;
  assert.equal(label(), undefined);
  state = command(state, {type: "expect-approach", approachId: null, vectors: true, runway});
  assert.equal(label(), `RV - EGPH ${runway}`, "controller assignment appears before pilot execution");
  const message = state.messages.at(-1)!;
  state = automatic ? autoReadbacks(fly(state, 1.5), 1500, randomUUID) : send(state, {kind: "pilot", aircraftId: "a", text: "readback", replyTo: message.id, assign: true});
  assert.equal(state.aircraft[0].runway, runway);
  assert.equal(label(), `RV - EGPH ${runway}`);
  state = assign(state, {type: "vector", heading: 180, altitude: {unit: "feet", value: 5000}});
  state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  assert.equal(label(), `RV - EGPH ${runway}`);
  const approach = state.radarEnvironment!.approaches.find(p => p.type === "ils")!;
  state = assign(state, {type: "expect-approach", approachId: approach.id});
  assert.equal(label(), `ILS - EGPH ${approach.runway}`);
  state = assign(state, {type: "expect-approach", approachId: null});
  assert.equal(label(), undefined);
  state = assign(state, {type: "vector", heading: 90});
  assert.equal(label(), undefined, "a heading alone does not assign an RV approach");
});

test("vector preview follows the free endpoint and preserves distance, time and nearby fix", () => {
  const state = exercise(), a = state.aircraft[0]; a.position = {x: 0, y: 0}; a.speed = 200;
  const raw = {x: Math.sin(224 * Math.PI / 180) * 10, y: Math.cos(224 * Math.PI / 180) * 10};
  const result = vectorPreview(a, raw, getAirport(state), {...state.radarEnvironment!, fixes: [{id: "LAMBORNE", point: raw}]});
  assert.equal(result.heading, 220); near(result.nm, 10); near(result.minutes!, 3); near(radarHeading(a.position, result.point), 224); assert.deepEqual(result.point, raw); assert.equal(result.fix, "LAMBORNE");
  assert.equal(vectorPreview(a, raw, getAirport(state), {...state.radarEnvironment!, fixes: [{id: "FAR", point: {x: 60, y: 0}}]}).fix, undefined);
  for (let heading = 0; heading < 360; heading++) assert.equal(snappedVectorHeading(a.position, {x: Math.sin(heading * Math.PI / 180), y: Math.cos(heading * Math.PI / 180)}, getAirport(state)) % 10, 0);
  assert.equal(snappedVectorHeading(a.position, {x: -.01, y: 10}, getAirport(state)), 0);
  a.speed = 0; assert.equal(vectorPreview(a, raw, getAirport(state)).minutes, null);
});
test("all heading instructions round consistently in transmissions, readbacks and assigned movement", () => {
  let state = exercise();
  state = command(state, {type: "vector", heading: 224});
  assert.match(state.messages.at(-1)!.text, /heading 220/);
  assert.deepEqual(state.messages.at(-1)!.instruction, {type: "vector", heading: 220});
  const id = state.messages.at(-1)!.id;
  state = send(state, {kind: "pilot", aircraftId: "a", text: "readback", replyTo: id, assign: true});
  assert.equal(state.aircraft[0].targetHeading, magneticToTrue(220, getAirport()));
  const sent = state.messages.find(m => m.id === id)!; assert.match(engineFor(state).readbackText(state.aircraft[0].callsign, sent.text, sent.instruction), /heading 220/);
  state = assign(state, {type: "vector", heading: 356}); assert.equal(state.aircraft[0].targetHeading, magneticToTrue(0, getAirport()));
  const engine = engineFor({trainingStation: "EGPH:local"});
  const local = engine.initialExercise(); local.aircraft = [engine.newAircraft("a", true)];
  assert.equal(assign(local, {type: "heading", value: 224}).aircraft[0].targetHeading, magneticToTrue(220, getAirport()));
});

test("altitude picker contains the reference 69 values and rejects gaps", () => {
  assert.equal(ALTITUDES.length, 69);
  assert.equal(altitudeLabel(ALTITUDES[0]), "1,000ft"); assert.equal(altitudeLabel(ALTITUDES[25]), "17,000ft");
  assert.equal(altitudeLabel(ALTITUDES[26]), "FL180"); assert.equal(altitudeLabel(ALTITUDES[68]), "FL600");
  for (const altitude of ALTITUDES) assert.ok(altitudeSchema.safeParse(altitude).success);
  for (const value of [{unit: "feet", value: 18000}, {unit: "feet", value: 1250}, {unit: "flight-level", value: 185}, {unit: "feet", value: NaN}]) assert.equal(altitudeSchema.safeParse(value).success, false);
  assert.equal(altitudeFeet({unit: "flight-level", value: 330}), 33000);
});
for (const airport of airportList) for (const mode of ["approach", "center"] as const) test(`${airport.icao} ${mode}: scenario pins, airborne defaults and station isolation`, () => {
  const definition = blankScenario({airport: airport.icao, trainingStation: `${airport.icao}:${mode}`});
  const engine = engineFor(definition), a = engine.newAircraft("a", true);
  definition.aircraft = [{key: "a", initial: true, seed: seedFromAircraft(a)}];
  const parsed = scenarioSchema.parse(JSON.parse(JSON.stringify(definition))), {exercise: state} = createScenarioExercise(parsed, "session", randomUUID());
  assert.equal(trainingMode(state), mode); assert.equal(openingFrequency(state), mode);
  assert.deepEqual(controlledFrequencies(state), [mode, "atis"]);
  assert.equal(state.aircraft[0].radar?.station, mode); assert.ok(state.aircraft[0].altitude > airport.elevation);
  assert.ok(state.radarEnvironment?.approaches.some(p => p.runway === defaultRunway(airport)));
  assert.deepEqual(restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state)))), state);
});
for (const [start, target] of [[0, 90], [90, 180], [0, 180], [350, 20], [10, 340]] as const) for (const step of [.1, 5]) test(`banked turn ${start} → ${target} rolls out on heading with ${step}s frames`, () => {
  let state = exercise(); Object.assign(state.aircraft[0], {heading: magneticToTrue(start, getAirport()), targetHeading: magneticToTrue(start, getAirport())});
  state = assign(state, {type: "vector", heading: target});
  const rolling = fly(state, 2, step).aircraft[0];
  near(Math.abs(rolling.bankAngle!), 12);
  assert.ok(Math.abs(((rolling.heading - magneticToTrue(start, getAirport()) + 540) % 360) - 180) < 6);
  state = fly(state, 120, step); near(state.aircraft[0].heading, magneticToTrue(target, getAirport()));
  near(state.aircraft[0].bankAngle!, 0);
  near(fly(state, 10, step).aircraft[0].heading, magneticToTrue(target, getAirport()));
  const line = engineFor(state).headingProjection(state.aircraft[0]); near(radarHeading(line[0], line[1]), magneticToTrue(target, getAirport()));
});
test("combined heading/altitude sends once and waits for manual assignment", () => {
  let state = exercise(); state.aircraft[0].heading = 0; const before = structuredClone(state.aircraft[0]);
  const instruction: Instruction = {type: "vector", heading: 90, altitude: {unit: "feet", value: 6000}};
  const envelope = {id: randomUUID(), time: 0, action: {kind: "command" as const, aircraftId: "a", frequency: "approach" as const, command: instruction, text: "ignored"}};
  state = applyEnvelope(state, envelope).state; assert.equal(state.messages[0].text, "Speedbird 1, turn right heading 090, climb and maintain 6,000ft");
  assert.deepEqual({...state.aircraft[0],assigned:undefined}, {...before,assigned:undefined}); assert.equal(applyEnvelope(state, envelope).state, state);
  state = send(state, {kind: "pilot", aircraftId: "a", text: "readback", replyTo: envelope.id}); assert.deepEqual({...state.aircraft[0],assigned:undefined}, {...before,assigned:undefined});
  state = command(state, instruction); const id = state.messages.at(-1)!.id;
  state = send(state, {kind: "pilot", aircraftId: "a", text: "readback", replyTo: id, assign: true});
  assert.equal(state.aircraft[0].targetHeading, magneticToTrue(90, getAirport())); assert.equal(state.aircraft[0].radar!.targetAltitude!.value, 6000);
  near(fly(state, 60).aircraft[0].altitude, 6000);
});
test("automatic readback assigns a combined clearance after the existing delay", () => {
  let state = exercise(); state.autoReadback = true;
  state = command(state, {type: "vector", heading: 90, altitude: {unit: "flight-level", value: 190}});
  const before = autoReadbacks(fly(state, 1), 1000, randomUUID); assert.notEqual(before.aircraft[0].targetHeading, 90);
  state = autoReadbacks(fly(state, 1.5), 1500, randomUUID);
  assert.equal(state.aircraft[0].targetHeading, magneticToTrue(90, getAirport())); assert.equal(state.aircraft[0].radar!.targetAltitude!.unit, "flight-level");
  assert.match(state.messages.at(-1)!.text, /FL190/); assert.equal(state.messages.filter(m => m.commandId).length, 1);
});
for (const mode of ["approach", "center"] as const) for (const heading of [0, 224]) test(`${mode}: dragged heading ${heading} and ILS clearance are read back and flown together`, () => {
  let state = exercise(mode); state.autoReadback = true;
  const a = state.aircraft[0], approach = state.radarEnvironment!.approaches.find(p => p.type === "ils")!;
  a.heading = a.targetHeading = 90; a.altitude = 3000;
  // Outside localizer capture: the drag vector must steer the aircraft to final.
  a.position = {x: 30, y: 30}; a.radar!.expected = approach.id;
  const target = Math.round(heading / 10) * 10 % 360;
  state = command(state, {type: "vector", heading, approachId: approach.id});
  assert.equal(state.aircraft[0].targetHeading, 90);
  assert.match(state.messages.at(-1)!.text, /heading .*cleared.*ILS/);
  state = autoReadbacks(fly(state, 1.5), 1500, randomUUID);
  assert.match(state.messages.at(-1)!.text, /heading .*cleared.*ILS/);
  assert.equal(state.aircraft[0].targetHeading, magneticToTrue(target, getAirport(state)));
  assert.equal(state.aircraft[0].radar!.cleared, approach.id);
  state = fly(state, 120);
  near(state.aircraft[0].heading, magneticToTrue(target, getAirport()));
  assert.equal(state.aircraft[0].radar!.cleared, approach.id);
});
for (const mode of ["approach", "center"] as const) for (const type of ["ils", "gps", "visual"] as const) for (const [altitude, heading, wording] of [[2500, undefined, "descend and maintain"], [3000, 0, "maintain"], [5000, 220, "climb and maintain"]] as const) test(`${mode} ${type}: approach clearance with ${heading ?? "no"} heading and ${altitude}ft is transmitted and assigned together`, () => {
  let state = exercise(mode); state.autoReadback = true;
  const a = state.aircraft[0], approach = state.radarEnvironment!.approaches.find(p => p.type === type)!;
  a.heading = a.targetHeading = 90; a.altitude = 3000; a.position = {x: 30, y: 30}; a.radar!.expected = approach.id;
  const instruction: Instruction = {type: "vector", ...(heading !== undefined ? {heading} : {}), altitude: {unit: "feet", value: altitude}, approachId: approach.id};
  const before = structuredClone(a);
  state = command(state, instruction);
  assert.deepEqual({...state.aircraft[0],assigned:undefined}, {...before,assigned:undefined}, "opening/sending the clearance must wait for readback before assignment");
  assert.equal(state.messages.length, 1);
  assert.deepEqual(state.messages[0].instruction, instruction);
  assert.match(state.messages[0].text, new RegExp(`${wording} ${altitude.toLocaleString("en-US")}ft.*cleared.*${type === "visual" ? "visual" : type.toUpperCase()}`));
  if (type === "ils") assert.match(state.messages[0].text, new RegExp(`maintain ${altitude.toLocaleString("en-US")}ft until established on the localizer`));
  state = autoReadbacks(fly(state, 1.5), 1500, randomUUID);
  assert.equal(state.messages.length, 2);
  if (type === "gps") {assert.match(state.messages[1].text, /Unable/); assert.equal(state.aircraft[0].radar!.cleared, undefined); return;}
  assert.match(state.messages[1].text, new RegExp(`${wording} ${altitude.toLocaleString("en-US")}ft`, "i"));
  assert.equal(state.aircraft[0].targetHeading, heading === undefined ? 90 : magneticToTrue(heading, getAirport()));
  assert.deepEqual(state.aircraft[0].radar!.targetAltitude, {unit: "feet", value: altitude});
  assert.equal(state.aircraft[0].radar!.cleared, approach.id);
});
for (const type of ["ils", "gps", "visual"] as const) test(`${type}: expectation does not capture, clearance does, missed approach resets guidance`, () => {
  let state = exercise(); const p = state.radarEnvironment!.approaches.find(p => p.type === type)!;
  const g = approachGeometry(getAirport(state), p.runway);
  Object.assign(state.aircraft[0], {position: {x: g.threshold.x - g.vector.x * 8, y: g.threshold.y - g.vector.y * 8}, heading: g.heading, targetHeading: g.heading, altitude: 2500});
  if (type === "gps") state.aircraft[0].flightPlan = [{x:g.threshold.x-g.vector.x*7.9,y:g.threshold.y-g.vector.y*7.9,finalApproachFix:true},{...g.threshold}];
  state = assign(state, {type: "expect-approach", approachId: p.id}); assert.equal(fly(state, 1).aircraft[0].radar!.captured, false);
  state = assign(state, {type: "vector", heading: trueToMagnetic(g.heading, getAirport(state)), altitude: {unit: "feet", value: 2500}, approachId: p.id});
  const captured = fly(state, type === "ils" ? 30 : type === "gps" ? 3 : 1); assert.equal(captured.aircraft[0].radar!.captured, true);
  const missed = assign(captured, {type: "missed-approach", altitude: {unit: "feet", value: 5000}});
  assert.equal(missed.aircraft[0].radar!.navigation, "missed"); assert.equal(missed.aircraft[0].radar!.cleared, undefined);
  assert.equal(missed.aircraft[0].radar!.captured, false); near(missed.aircraft[0].targetHeading, captured.aircraft[0].targetHeading);
  assert.ok(fly(missed, 5).aircraft[0].altitude > captured.aircraft[0].altitude);
});
test("stale approach clearance rejects the entire instruction without applying its heading or altitude", () => {
  let state = exercise(); const [p, other] = state.radarEnvironment!.approaches;
  state = assign(state, {type: "expect-approach", approachId: p.id});
  state = command(state, {type: "vector", heading: 10, altitude: {unit: "feet", value: 6000}, approachId: p.id});
  const commandId = state.messages.at(-1)!.id; state = assign(state, {type: "expect-approach", approachId: other.id});
  const result = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "pilot", aircraftId: "a", replyTo: commandId, assign: true, text: "readback"}});
  assert.match(result.error!, /changed/); assert.equal(result.state, state);
});
test("radar vectors remove approach eligibility; Unable responses grant no clearance", () => {
  let state = exercise(); state = assign(state, {type: "expect-approach", approachId: state.radarEnvironment!.approaches[0].id});
  state = assign(state, {type: "expect-approach", approachId: null, vectors: true});
  assert.equal(state.aircraft[0].radar!.expected, undefined); assert.equal(state.aircraft[0].radar!.cleared, undefined);
  const menu = catalogFor(getAirport(state), state.radarEnvironment).messageMenu("approach", state.aircraft[0]);
  assert.ok(menu.some(e => e.label === "Request Hold")); assert.ok(!menu.some(e => e.label === "Clear for Approach"));
  assert.deepEqual(menu.find(e=>e.label==="Expect Approach...")!.children!.map(e => e.label), ["ILS Approach", "GPS Approach", "Visual Approach", "Radar Vectors", "Unable (Outside of Coverage Area)", "Unable at this time", "Outside Airspace"]);
  for (const entry of menu.find(e=>e.label==="Expect Approach...")!.children!.slice(-3)) assert.equal(entry.children![0].instruction!.type, "atc");
});
test("altitude-only preserves heading and route; Center keeps assigned speed", () => {
  let state = exercise("center"); state.aircraft[0].flightPlan = [{x: 10, y: 10}, {x: 20, y: 0}];
  state = assign(state, {type: "route", index: 0}); state = assign(state, {type: "vector", altitude: {unit: "flight-level", value: 310}});
  assert.equal(state.aircraft[0].radar!.navigation, "route"); near(fly(state, 5).aircraft[0].targetSpeed, 450);
  state = assign(state, {type: "speed", value: 380}); near(fly(state, 60).aircraft[0].speed, 380);
  state = assign(state, {type: "vector", heading: 180}); assert.equal(state.aircraft[0].radar!.navigation, "heading");
  state = assign(state, {type: "route", index: 1}); assert.equal(state.aircraft[0].radar!.routeIndex, 1);
});
test("route follows and completes without mutating source snapshots through prediction", () => {
  let state = exercise("center"); Object.assign(state.aircraft[0], {position: {x: 0, y: 0}, heading: 90, targetHeading: 90, flightPlan: [{x: 4, y: 0}]});
  state = assign(state, {type: "route", index: 0}); const before = JSON.stringify(state);
  engineFor(state).predictAircraft(state.aircraft, 1); engineFor(state).projectedPath(state.aircraft[0], 120);
  assert.equal(JSON.stringify(state), before);
  const after = fly(state, 40); assert.equal(after.aircraft[0].radar!.navigation, "heading"); assert.equal(after.aircraft[0].radar!.routeIndex, 1);
});
test("transfer leaves controlled traffic and manual retune can bring it back", () => {
  let state = exercise(); state = assign(state, {type: "frequency", frequency: "tower"});
  assert.equal(state.aircraft[0].radar!.transferred, true);
  assert.equal(menteeActionAllowed({kind: "command", aircraftId: "a", frequency: "tower", command: {type: "vector", heading: 90}, text: ""}, state), false);
  state = send(state, {kind: "edit", aircraftId: "a", patch: {frequency: "approach"}}); assert.equal(state.aircraft[0].radar!.transferred, false);
});
test("new commands remain restricted in Ground & Tower", () => {
  const local = engineFor().initialExercise(); const action: Action = {kind: "command", aircraftId: local.aircraft[0].id, frequency: "tower", text: "", command: {type: "vector", heading: 90}};
  assert.equal(menteeActionAllowed(action, local), false); assert.ok(applyEnvelope(local, {id: randomUUID(), time: 0, action}).error);
  assert.deepEqual(controlledFrequencies(local), ["ground", "tower", "atis"]);
});
test("custom environment, pending compound command and movement survive JSON reload and replay", () => {
  let initial = exercise(); initial.radarEnvironment!.approaches[0].missedHeading = 10;
  initial = assign(initial, {type: "expect-approach", approachId: initial.radarEnvironment!.approaches[0].id});
  const after = command(initial, {type: "vector", heading: 90, altitude: {unit: "flight-level", value: 180}});
  const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(after)))); assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(after)));
  const timeline = new ReplayTimeline(initial, [{sequence: 1, at: 1, delta: replayDelta(initial, after), interpolate: false}]); assert.deepEqual(timeline.at(1), after);
});
test("scenario altitude, approach and transfer conditions fire in radar exercises", () => {
  const definition = blankScenario({trainingStation: "EGPH:approach"});
  definition.aircraft = [{key: "a", initial: true, seed: seedFromAircraft(engineFor(definition).newAircraft("a", true))}];
  definition.events = [{id: "altitude", title: "At altitude", trigger: {type: "condition", condition: {type: "altitude", aircraftKey: "a", altitude: 5000}, delay: 0}, actions: [{type: "transmission", aircraftKey: "a", text: "level"}]}];
  const {exercise: state, runtime} = createScenarioExercise(scenarioSchema.parse(definition), "session", randomUUID()); state.running = true;
  const after = advanceScenario(state, runtime, 1, 0).exercise; assert.equal(runtime.events.altitude.status, "completed"); assert.match(after.messages[0].text, /level/);
});
test("session service authorizes radar commands and blocks paused or off-mode commands", async () => {
  const store = new MemoryStore(), service = new SessionService(store, () => 1000), actor = {accountId: "staff", staff: true};
  const row = await service.create(actor, "Radar", exercise()), staff = randomUUID(), learner = randomUUID();
  await service.join(actor, row.id, "staff", staff); await service.join(actor, row.id, "mentee", learner);
  const envelope = {id: randomUUID(), time: 0, action: {kind: "command" as const, aircraftId: "a", frequency: "approach" as const, text: "", command: {type: "vector" as const, heading: 90}}};
  await service.dispatch(actor, row.id, "mentee", learner, envelope);
  await assert.rejects(service.dispatch(actor, row.id, "mentee", learner, {...envelope, id: randomUUID(), action: {...envelope.action, frequency: "tower"}}), /unavailable/);
  await service.dispatch(actor, row.id, "staff", staff, {id: randomUUID(), time: 0, action: {kind: "pause"}});
  await assert.rejects(service.dispatch(actor, row.id, "mentee", learner, {...envelope, id: randomUUID()}), /paused/);
});

test("resume route retains progress after a vector, while direct-to chooses an explicit waypoint", () => {
  let state = exercise("center"); state.aircraft[0].flightPlan = [{x: 5, y: 5}, {x: 20, y: 20}];
  state = assign(state, {type: "route", index: 1}); state = assign(state, {type: "vector", heading: 90});
  assert.equal(state.aircraft[0].radar!.routeIndex, 1);
  state = assign(state, {type: "route", index: 1}); assert.equal(state.aircraft[0].radar!.routeIndex, 1);
  state = assign(state, {type: "route", index: 0}); assert.equal(state.aircraft[0].radar!.routeIndex, 0);
});

test("transferred radar traffic keeps radar pilot requests and cannot switch into circuit movement", () => {
  let state = assign(exercise(), {type: "frequency", frequency: "tower"});
  const requests = catalogFor(getAirport(state), state.radarEnvironment).pilotRequests(state.aircraft[0]);
  assert.deepEqual(requests.map(r => r.id), ["altitude-change","excellent-service","back-with-you","roger","wilco","standby","unable","correction","check-in", "request-approach", "missed-approach", "frequency-change", "flight-following", "radar-vectors", "star-descent", "diversion", "airport-in-sight"]);
  const result = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: "a", command: {type: "pattern", leg: "downwind"}}});
  assert.match(result.error!, /unavailable/); assert.equal(result.state, state);
  state = send(state, {kind: "pilot", aircraftId: "a", text: "", request: {id: "missed-approach", runway: defaultRunway(getAirport(state))}});
  assert.equal(state.aircraft[0].mode, "heading"); assert.equal(state.aircraft[0].radar!.navigation, "missed");
});

test("invalid approach pins and mentor edits cannot corrupt a radar exercise", () => {
  const state = exercise(); const invalid = structuredClone(state); invalid.aircraft[0].radar!.expected = "absent";
  assert.equal(exerciseSchema.safeParse(invalid).success, false);
  for (const patch of [{radar: {...state.aircraft[0].radar!, expected: "absent"}}, {radar: {...state.aircraft[0].radar!, station: "center" as const}}, {altitude: 0}]) {
    const result = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "edit", aircraftId: "a", patch}});
    assert.ok(result.error); assert.equal(result.state, state);
  }
});

test("a scenario seeded on another frequency starts as transferred radar traffic", () => {
  const definition = blankScenario({trainingStation: "EGPH:approach"}), seed = seedFromAircraft(engineFor(definition).newAircraft("a", true));
  seed.frequency = "tower"; definition.aircraft = [{key: "a", initial: true, seed}];
  const state = createScenarioExercise(scenarioSchema.parse(definition), "session", randomUUID()).exercise;
  assert.equal(state.aircraft[0].radar!.transferred, true); assert.equal(state.aircraft[0].frequency, "tower");
  assert.equal(menteeActionAllowed({kind: "command", aircraftId: state.aircraft[0].id, frequency: "approach", text: "", command: {type: "vector", heading: 90}}, state), false);
});

for (const transfer of [false, true]) test(`approach threshold ${transfer ? "completes a Tower handoff" : "triggers a missed approach on the radar position"}`, () => {
  let state = exercise(); const approach = state.radarEnvironment!.approaches[0], g = approachGeometry(getAirport(state), approach.runway);
  Object.assign(state.aircraft[0], {position: {x: g.threshold.x - g.vector.x * .02, y: g.threshold.y - g.vector.y * .02}, heading: g.heading, targetHeading: g.heading, altitude: getAirport(state).elevation + 60});
  state = assign(state, {type: "expect-approach", approachId: approach.id}); state = assign(state, {type: "vector", approachId: approach.id}); Object.assign(state.aircraft[0].radar!, {captured: true, localizer: true, glideslope: true});
  if (transfer) state = assign(state, {type: "frequency", frequency: "tower"});
  state = fly(state, .1, .1);
  assert.equal(state.aircraft[0].active, true);
  if (transfer) {assert.equal(state.aircraft[0].mode, "heading"); state = fly(state, 10, .1); assert.equal(state.aircraft[0].mode, "rollout"); assert.equal(state.aircraft[0].altitude, getAirport(state).elevation); assert.equal(state.aircraft[0].radar!.arrival!.phase, "rollout");}
  if (!transfer) {assert.equal(state.aircraft[0].radar!.navigation, "missed"); assert.equal(state.aircraft[0].radar!.report, "missed");}
});
