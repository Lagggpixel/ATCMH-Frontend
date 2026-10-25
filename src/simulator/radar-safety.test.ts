import {magneticToTrue} from "./magnetic-headings";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {advance, applyEnvelope, autoReadbacks, engineFor, readbackText} from "./engine";
import {getAirport} from "./airports";
import {ALTITUDES, approachGeometry, moveRadar} from "./radar";
import {automaticRadarUnable, radarApproachExempt, radarSeparationAlerts, separationLabel, terrainClearance} from "./radar-safety";
import {aircraftSpeedLimits} from "./radar-speed";
import {exerciseSchema} from "./protocol";
import type {Action, Exercise, Instruction} from "./model";

function fixture(mode: "approach" | "center" = "approach") {
  const engine = engineFor({trainingStation: `EGPH:${mode}`}), state = engine.initialExercise();
  state.aircraft = [state.aircraft[0]]; state.running = true; state.autoReadback = true;
  state.aircraft[0].callsign = "Speedbird 1"; delete state.aircraft[0].radar!.report; return state;
}

function act(state: Exercise, action: Action) {
  const result = applyEnvelope(state, {id: randomUUID(), time: 0, action}); assert.equal(result.error, undefined); return result.state;
}

function clear(state: Exercise, type: "ils" | "gps" | "visual" = "gps") {
  const p = state.radarEnvironment!.approaches.find(p => p.type === type)!;
  if (type === "gps") {
    const g = approachGeometry(getAirport(state), p.runway), a = state.aircraft[0];
    a.position = {x:g.threshold.x-g.vector.x*20,y:g.threshold.y-g.vector.y*20}; a.heading=a.targetHeading=g.heading;
    a.flightPlan = [{x:g.threshold.x-g.vector.x*5,y:g.threshold.y-g.vector.y*5,finalApproachFix:true},{...g.threshold}]; a.radar!.routeIndex=0;
  }
  state = act(state, {kind: "maneuver", aircraftId: state.aircraft[0].id, command: {type: "expect-approach", approachId: p.id}});
  return act(state, {kind: "maneuver", aircraftId: state.aircraft[0].id, command: {type: "vector", approachId: p.id}});
}

function transmit(state: Exercise, command: Instruction) {
  const a = state.aircraft[0]; state = act(state, {kind: "command", aircraftId: a.id, frequency: a.radar!.station, command, text: ""});
  return autoReadbacks(advance(state, 1.5), 1500, randomUUID);
}

test("altitude readbacks capitalize climb/descend and retain the final callsign", () => {
  assert.equal(readbackText("Speedbird 1", "Speedbird 1, climb and maintain 5000", {type: "vector", altitude: {unit: "feet", value: 5000}}), "Climb and maintain 5000, Speedbird 1");
  assert.equal(readbackText("Speedbird 1", "Speedbird 1, descend and maintain 3000", {type: "vector", altitude: {unit: "feet", value: 3000}}), "Descend and maintain 3000, Speedbird 1");
});

for (const mode of ["approach", "center"] as const) for (const type of ["ils", "gps", "visual"] as const) test(`${mode} ${type}: cleared aircraft read back and accept revised instructions`, () => {
  for (const command of [
    {type: "vector", heading: 230}, {type: "vector", altitude: {unit: "feet", value: 6000}},
    {type: "vector", heading: 230, altitude: {unit: "feet", value: 6000}}, {type: "speed", value: 220},
    {type: "radar-speed", mode: "maintain", unit: "knots", value: 220, relation: "exact"},
    {type: "radar-speed", mode: "discretion"},
    {type: "radar-speed", mode: "approach", value: 160, until: 4},
  ] satisfies Instruction[]) {
    const initial = clear(fixture(mode), type), clearance = initial.aircraft[0].radar!.cleared;
    initial.aircraft[0].altitude = 5000;
    const state = transmit(initial, command), a = state.aircraft[0];
    const sent = state.messages.find(message => message.sender === "controller")!, reply = state.messages.at(-1)!;
    assert.equal(reply.text, readbackText(a.callsign, sent.text, sent.instruction));
    assert.equal(reply.commandId, sent.id); assert.equal(reply.unableReason, undefined);
    if (command.type === "vector" && command.heading !== undefined) {
      assert.equal(a.targetHeading, magneticToTrue(230, getAirport())); assert.equal(a.radar!.navigation, "heading");
      assert.equal(a.radar!.cleared, undefined); assert.equal(a.radar!.captured, false);
      assert.equal(a.radar!.localizer, false); assert.equal(a.radar!.glideslope, false);
    } else assert.equal(a.radar!.cleared, clearance);
    if (command.type === "vector" && command.altitude) assert.deepEqual(a.radar!.targetAltitude, command.altitude);
    if (command.type === "speed" || command.type === "radar-speed" && command.mode === "maintain") assert.equal(a.targetSpeed, 220);
    if (command.type === "radar-speed" && command.mode === "approach") assert.equal(a.radar!.speed?.mode, "approach");
    if (command.type === "radar-speed" && command.mode === "discretion") {assert.equal(a.speedMode, "auto"); assert.equal(a.radar!.speed, undefined);}
    assert.equal(autoReadbacks(state, 2000, randomUUID).messages.length, state.messages.length);
  }
  const initial = clear(fixture(mode), type), approachId = initial.aircraft[0].radar!.cleared!;
  initial.aircraft[0].altitude = 5000;
  const command: Instruction = {type: "vector", heading: 230, altitude: {unit: "feet", value: 6000}, approachId};
  const state = transmit(initial, command), a = state.aircraft[0];
  if (type === "gps") {assert.match(state.messages.at(-1)!.text, /^Unable/); assert.match(state.messages.at(-1)!.unableReason!, /rejoin/); return;}
  assert.doesNotMatch(state.messages.at(-1)!.text, /^Unable/);
  assert.equal(a.targetHeading, magneticToTrue(230, getAirport())); assert.deepEqual(a.radar!.targetAltitude, command.altitude);
  assert.equal(a.radar!.cleared, approachId); assert.equal(a.radar!.navigation, "approach");
});

test("ILS-established aircraft accepts a new heading and altitude and leaves captured guidance", () => {
  const initial = clear(fixture(), "ils"), a = initial.aircraft[0], airport = getAirport(initial);
  const approach = initial.radarEnvironment!.approaches.find(p => p.id === a.radar!.cleared)!, g = approachGeometry(airport, approach.runway);
  a.position = {x: g.threshold.x - g.vector.x * 8, y: g.threshold.y - g.vector.y * 8};
  a.heading = a.targetHeading = g.heading;
  a.altitude = airport.elevation + 50 + 8 * 6076.12 * Math.tan(approach.glideAngle * Math.PI / 180);
  Object.assign(a.radar!, {captured: true, localizer: true, glideslope: true, clearanceAltitudeChecked: true});
  const state = transmit(initial, {type: "vector", heading: 90, altitude: {unit: "feet", value: 6000}}), assigned = state.aircraft[0];
  assert.doesNotMatch(state.messages.at(-1)!.text, /^Unable/);
  assert.equal(assigned.targetHeading, magneticToTrue(90, getAirport())); assert.equal(assigned.radar!.navigation, "heading");
  assert.equal(assigned.radar!.cleared, undefined); assert.equal(assigned.radar!.captured, false);
  const after = advance(state, 10).aircraft[0];
  assert.equal(after.targetHeading, magneticToTrue(90, getAirport())); assert.ok(after.altitude > assigned.altitude);
});

test("cleared aircraft still refuses speeds outside aircraft limits", () => {
  for (const command of [{type: "speed", value: 350}, {type: "radar-speed", mode: "maintain", unit: "knots", value: 100, relation: "exact"}] satisfies Instruction[]) {
    const initial = clear(fixture(), "ils"), before = structuredClone(initial.aircraft[0]);
    const state = transmit(initial, command), reply = state.messages.at(-1)!;
    assert.equal(reply.text, "Unable, Speedbird 1"); assert.equal(reply.unableReason, "Speed outside aircraft limits.");
    assert.equal(state.aircraft[0].radar!.cleared, before.radar!.cleared);
    assert.equal(state.aircraft[0].targetSpeed, before.targetSpeed);
  }
});

test("automatic speed refusals use aircraft type and restriction semantics, including Mach", () => {
  const a = fixture().aircraft[0];
  const state = transmit(fixture(), {type: "radar-speed", mode: "maintain", unit: "knots", value: 100, relation: "exact"});
  assert.match(state.messages.at(-1)!.text, /^Unable, Speedbird 1$/); assert.equal(state.aircraft[0].targetSpeed, 250);
  assert.ok(automaticRadarUnable(a, {type: "speed", value: 350}));
  assert.ok(automaticRadarUnable(a, {type: "radar-speed", mode: "maintain", unit: "knots", value: 100, relation: "maximum"}));
  assert.equal(automaticRadarUnable(a, {type: "radar-speed", mode: "maintain", unit: "knots", value: 100, relation: "minimum"}), null);
  assert.ok(automaticRadarUnable(a, {type: "radar-speed", mode: "maintain", unit: "mach", value: .9, relation: "exact"}));
  a.altitude = 35000; assert.equal(automaticRadarUnable(a, {type: "radar-speed", mode: "maintain", unit: "mach", value: .8, relation: "exact"}), null);
  a.type = "C172"; assert.equal(automaticRadarUnable(a, {type: "speed", value: 100}), null); assert.ok(automaticRadarUnable(a, {type: "speed", value: 250}));
  assert.deepEqual(aircraftSpeedLimits("A320"), {min: 135, max: 340, mach: .82}); assert.equal(aircraftSpeedLimits("unknown"), undefined);
});

test("missed approach is Unable without clearance; automatic off preserves manual control", () => {
  const command: Instruction = {type: "missed-approach", altitude: {unit: "feet", value: 6000}};
  const state = transmit(fixture(), command); assert.match(state.messages.at(-1)!.text, /^Unable, Speedbird 1$/); assert.equal(state.aircraft[0].radar!.navigation, "heading");
  let manual = fixture(); manual.autoReadback = false; manual = transmit(manual, {type: "speed", value: 100}); assert.equal(manual.messages.length, 1);
  manual = act(manual, {kind: "pilot", aircraftId: manual.aircraft[0].id, replyTo: manual.messages[0].id, text: "Readback", assign: true}); assert.equal(manual.aircraft[0].targetSpeed, 100);
  const a = clear(fixture()).aircraft[0]; assert.equal(automaticRadarUnable(a, command), null);
});

test("predictive proximity uses IF strict limits and includes cleared approaches", () => {
  const state = fixture(), a = state.aircraft[0], b = {...structuredClone(a), id: "b", callsign: "Speedbird 2"}; a.position = {x: 0, y: 0}; a.altitude = 5000; b.position = {x: 1, y: 0}; b.altitude = 5500;
  const alerts = () => radarSeparationAlerts([a, b], state.radarEnvironment);
  assert.equal(alerts().size, 2); assert.equal(separationLabel(alerts().get(a.id)![0]), "1nm 500ft");
  b.position.x = 3; assert.equal(alerts().size, 0); b.position.x = 1; b.altitude = 7000; assert.equal(alerts().size, 0); b.altitude = 5500;
  const gps = state.radarEnvironment!.approaches.find(p => p.type === "gps")!;
  a.radar!.navigation = "approach"; a.radar!.cleared = gps.id; assert.equal(alerts().size, 2);
  b.radar!.navigation = "approach"; b.radar!.cleared = gps.id; assert.equal(alerts().size, 2);
  const ils = state.radarEnvironment!.approaches.find(p => p.type === "ils")!; b.radar!.cleared = ils.id; assert.equal(alerts().size, 2); b.radar!.localizer = true; assert.equal(alerts().size, 2);
  b.radar!.cleared = undefined; b.radar!.guidance = "vectors"; b.radar!.transferred = true; b.frequency = "tower"; assert.equal(alerts().size, 2);
  b.active = false; a.radar!.cleared = undefined; assert.equal(alerts().size, 0);
});

test("terrain alerts use raw AGL below 1000ft and the same approach exemptions", () => {
  const state = fixture(), a = state.aircraft[0]; a.altitude = 5000;
  assert.equal(terrainClearance(a, 4000, state.radarEnvironment), undefined); assert.equal(terrainClearance(a, 4000.1, state.radarEnvironment), 999.9000000000001);
  assert.equal(terrainClearance(a, undefined, state.radarEnvironment), undefined); assert.equal(terrainClearance(a, NaN, state.radarEnvironment), undefined);
  for (const type of ["gps", "visual", "ils"] as const) {
    const p = state.radarEnvironment!.approaches.find(p => p.type === type)!; a.radar!.cleared = p.id; a.radar!.navigation = "approach"; a.radar!.localizer = false;
    assert.equal(radarApproachExempt(a, state.radarEnvironment), type !== "ils");
    if (type === "ils") {assert.equal(terrainClearance(a, 4500, state.radarEnvironment), 500); a.radar!.localizer = true;}
    assert.equal(terrainClearance(a, 4500, state.radarEnvironment), undefined);
  }
  a.radar!.cleared = undefined; a.radar!.guidance = "vectors"; a.radar!.transferred = true; a.frequency = "tower"; assert.equal(terrainClearance(a, 4500, state.radarEnvironment), undefined);
});

for (const type of ["gps", "visual", "ils"] as const) test(`${type}: excessive height above glide path triggers a single automatic missed approach at the correct stage`, () => {
  let state = clear(fixture(), type); const a = state.aircraft[0], p = state.radarEnvironment!.approaches.find(p => p.id === a.radar!.cleared)!, airport = getAirport(state), g = approachGeometry(airport, p.runway);
  const nm = type === "gps" ? 5 : 8;
  a.position = {x: g.threshold.x - g.vector.x * nm, y: g.threshold.y - g.vector.y * nm}; a.heading = a.targetHeading = g.heading;
  const glide = airport.elevation + 50 + nm * 6076.12 * Math.tan(p.glideAngle * Math.PI / 180); a.altitude = glide + (type === "visual" ? 501 : type === "gps" ? 26 : 1);
  const manual = structuredClone(a); moveRadar(manual, .05, airport, state.radarEnvironment!, [], false); assert.notEqual(manual.radar!.navigation, "missed");
  if (type === "ils") {a.position.x += g.vector.y * (p.captureWidth + .1); a.position.y -= g.vector.x * (p.captureWidth + .1); moveRadar(a, .05, airport, state.radarEnvironment!, [], true); assert.notEqual(a.radar!.navigation, "missed"); a.position = {x: g.threshold.x - g.vector.x * 8, y: g.threshold.y - g.vector.y * 8}; a.altitude = glide + 1;}
  const atGlide = structuredClone(a); atGlide.altitude = glide; for (let i = 0; i < 60; i++) moveRadar(atGlide, .05, airport, state.radarEnvironment!, [], true); assert.notEqual(atGlide.radar!.navigation, "missed");
  moveRadar(a, .05, airport, state.radarEnvironment!, [], true); assert.equal(a.radar!.navigation, "missed"); assert.equal(a.radar!.cleared, undefined); assert.ok(ALTITUDES.some(level => level.unit === a.radar!.targetAltitude!.unit && level.value === a.radar!.targetAltitude!.value));
  state = autoReadbacks(state, 1000, randomUUID); assert.equal(state.messages.at(-1)!.text, "Speedbird 1, executing missed approach"); const count = state.messages.length;
  state = autoReadbacks(advance(state, 1), 2000, randomUUID); assert.equal(state.messages.length, count);
  assert.ok(exerciseSchema.safeParse(state).success);
});

for (const mode of ["approach", "center"] as const) for (const excess of [1, 250, 500]) test(`${mode}: visual approach recovers from ${excess}ft above glide path`, () => {
  const state = clear(fixture(mode), "visual"), a = state.aircraft[0], environment = state.radarEnvironment!, airport = getAirport(state);
  const p = environment.approaches.find(p => p.id === a.radar!.cleared)!, g = approachGeometry(airport, p.runway);
  a.position = {x: g.threshold.x - g.vector.x * 8, y: g.threshold.y - g.vector.y * 8};
  a.heading = a.targetHeading = g.heading; a.speed = a.targetSpeed = 180;
  const glide = airport.elevation + 50 + 8 * 6076.12 * Math.tan(p.glideAngle * Math.PI / 180);
  const initialAltitude = a.altitude = glide + excess;
  for (let t = 0; t < 60; t += .05) moveRadar(a, .05, airport, environment, [], true);
  assert.equal(a.radar!.navigation, "approach"); assert.equal(a.radar!.cleared, p.id);
  assert.equal(a.radar!.clearanceAltitudeChecked, true); assert.equal(a.radar!.captured, true);
  assert.ok(a.altitude < initialAltitude, "visual traffic must descend and recover the path");
  assert.notEqual(a.radar!.report, "missed");
});

const fixtureForInfiniteFlightParity=()=>engineFor({trainingStation:"EGPH:approach"}).initialExercise();

test("proximity predicts converging airborne traffic and does not exempt approaches",()=>{
 const a=fixtureForInfiniteFlightParity().aircraft[0],b=structuredClone(a);a.position={x:-3,y:0};b.position={x:3,y:0};a.heading=90;b.heading=270;a.speed=b.speed=360;a.altitude=b.altitude=5000;b.id="b";
 assert.equal(radarSeparationAlerts([a,b]).get(a.id)?.[0].level,"critical");a.radar!.navigation=b.radar!.navigation="approach";a.radar!.cleared=b.radar!.cleared="ils-24";assert.equal(radarSeparationAlerts([a,b]).size,2);
 b.position={x:3,y:3};b.heading=90;assert.equal(radarSeparationAlerts([a,b]).size,0);
});
