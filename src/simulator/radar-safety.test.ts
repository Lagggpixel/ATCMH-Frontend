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
for (const mode of ["approach", "center"] as const) test(`${mode}: automatic Unable consumes blocked commands without changing assigned clearance`, () => {
  for (const command of [
    {type: "vector", heading: 230}, {type: "vector", altitude: {unit: "feet", value: 6000}},
    {type: "vector", heading: 230, altitude: {unit: "feet", value: 6000}}, {type: "speed", value: 220},
    {type: "radar-speed", mode: "maintain", unit: "knots", value: 220, relation: "exact"},
    {type: "radar-speed", mode: "discretion"},
  ] satisfies Instruction[]) {
    const initial = clear(fixture(mode)), before = structuredClone(initial.aircraft[0]);
    // Keep Center's high initial altitude below this clearance's glide path.
    initial.aircraft[0].altitude = 5000;
    const state = transmit(initial, command), a = state.aircraft[0];
    assert.match(state.messages.at(-1)!.text, /^Unable, Already cleared for approach/);
    assert.equal(a.radar!.cleared, before.radar!.cleared); assert.equal(a.radar!.targetAltitude, before.radar!.targetAltitude); assert.equal(a.targetHeading, before.targetHeading); assert.equal(a.targetSpeed, before.targetSpeed);
    assert.equal(autoReadbacks(state, 2000, randomUUID).messages.length, state.messages.length);
  }
  const initial = fixture(mode); initial.aircraft[0].altitude = 5000;
  const state = transmit(clear(initial), {type: "radar-speed", mode: "approach", value: 160, until: 4});
  assert.doesNotMatch(state.messages.at(-1)!.text, /^Unable/); assert.equal(state.aircraft[0].radar!.speed?.mode, "approach");
});
test("automatic speed refusals use aircraft type and restriction semantics, including Mach", () => {
  const a = fixture().aircraft[0];
  const state = transmit(fixture(), {type: "radar-speed", mode: "maintain", unit: "knots", value: 100, relation: "exact"});
  assert.match(state.messages.at(-1)!.text, /^Unable, Speed outside aircraft limits/); assert.equal(state.aircraft[0].targetSpeed, 250);
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
  const state = transmit(fixture(), command); assert.match(state.messages.at(-1)!.text, /^Unable, Not cleared for approach/); assert.equal(state.aircraft[0].radar!.navigation, "heading");
  let manual = fixture(); manual.autoReadback = false; manual = transmit(manual, {type: "speed", value: 100}); assert.equal(manual.messages.length, 1);
  manual = act(manual, {kind: "pilot", aircraftId: manual.aircraft[0].id, replyTo: manual.messages[0].id, text: "Readback", assign: true}); assert.equal(manual.aircraft[0].targetSpeed, 100);
  const a = clear(fixture()).aircraft[0]; assert.equal(automaticRadarUnable(a, command), null);
});
test("separation circles both aircraft only inside BOTH strict limits, and exempts only qualifying pairs", () => {
  const state = fixture(), a = state.aircraft[0], b = {...structuredClone(a), id: "b", callsign: "Speedbird 2"}; a.position = {x: 0, y: 0}; a.altitude = 5000; b.position = {x: 2, y: 0}; b.altitude = 5500;
  const alerts = () => radarSeparationAlerts([a, b], state.radarEnvironment);
  assert.equal(alerts().size, 2); assert.equal(separationLabel(alerts().get(a.id)![0]), "2nm 500ft");
  b.position.x = 3; assert.equal(alerts().size, 0); b.position.x = 2; b.altitude = 6000; assert.equal(alerts().size, 0); b.altitude = 5500;
  const gps = state.radarEnvironment!.approaches.find(p => p.type === "gps")!;
  a.radar!.navigation = "approach"; a.radar!.cleared = gps.id; assert.equal(alerts().size, 2);
  b.radar!.navigation = "approach"; b.radar!.cleared = gps.id; assert.equal(alerts().size, 0);
  const ils = state.radarEnvironment!.approaches.find(p => p.type === "ils")!; b.radar!.cleared = ils.id; assert.equal(alerts().size, 2); b.radar!.localizer = true; assert.equal(alerts().size, 0);
  b.radar!.cleared = undefined; b.radar!.guidance = "vectors"; b.radar!.transferred = true; b.frequency = "tower"; assert.equal(alerts().size, 0);
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
for (const type of ["gps", "visual", "ils"] as const) test(`${type}: above glide path triggers a single automatic missed approach at the correct stage`, () => {
  let state = clear(fixture(), type); const a = state.aircraft[0], p = state.radarEnvironment!.approaches.find(p => p.id === a.radar!.cleared)!, airport = getAirport(state), g = approachGeometry(airport, p.runway);
  a.position = {x: g.threshold.x - g.vector.x * 8, y: g.threshold.y - g.vector.y * 8}; a.heading = a.targetHeading = g.heading;
  const glide = airport.elevation + 50 + 8 * 6076.12 * Math.tan(p.glideAngle * Math.PI / 180); a.altitude = glide + 1;
  const manual = structuredClone(a); moveRadar(manual, .05, airport, state.radarEnvironment!, [], false); assert.notEqual(manual.radar!.navigation, "missed");
  if (type === "ils") {a.position.x += g.vector.y * (p.captureWidth + .1); a.position.y -= g.vector.x * (p.captureWidth + .1); moveRadar(a, .05, airport, state.radarEnvironment!, [], true); assert.notEqual(a.radar!.navigation, "missed"); a.position = {x: g.threshold.x - g.vector.x * 8, y: g.threshold.y - g.vector.y * 8}; a.altitude = glide + 1;}
  const atGlide = structuredClone(a); atGlide.altitude = glide; for (let i = 0; i < 60; i++) moveRadar(atGlide, .05, airport, state.radarEnvironment!, [], true); assert.notEqual(atGlide.radar!.navigation, "missed");
  moveRadar(a, .05, airport, state.radarEnvironment!, [], true); assert.equal(a.radar!.navigation, "missed"); assert.equal(a.radar!.cleared, undefined); assert.ok(ALTITUDES.some(level => level.unit === a.radar!.targetAltitude!.unit && level.value === a.radar!.targetAltitude!.value));
  state = autoReadbacks(state, 1000, randomUUID); assert.equal(state.messages.at(-1)!.text, "Speedbird 1, executing missed approach"); const count = state.messages.length;
  state = autoReadbacks(advance(state, 1), 2000, randomUUID); assert.equal(state.messages.length, count);
  assert.ok(exerciseSchema.safeParse(state).success);
});
