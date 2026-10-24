import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor, applyEnvelope, advance, autoReadbacks} from "./engine";
import {catalogFor, HEADING_CHOICES, radarSpeedMenu} from "./catalog";
import {getAirport, openingFrequency} from "./airports";
import {approachGeometry} from "./radar";
import {KNOT_SPEEDS_LOW, KNOT_SPEEDS_HIGH, MACH_SPEEDS, radarSpeedText, machKnots, updateRadarSpeed} from "./radar-speed";
import {trueAirspeed} from "./aircraft-performance";
import {EXERCISE_WEATHER} from "./model";
import {exerciseSchema, instructionSchema, menteeActionAllowed} from "./protocol";
import type {Action, Exercise, RadarSpeedInstruction} from "./model";
function fixture(mode: "approach" | "center" = "approach") {
  const engine = engineFor({trainingStation: `EGPH:${mode}`}), state = engine.initialExercise();
  state.running = true; state.autoReadback = false; state.aircraft = [engine.newAircraft("a", true)];
  state.aircraft[0].callsign = "Speedbird 1"; delete state.aircraft[0].radar!.report; return state;
}
function act(state: Exercise, action: Action) {
  const result = applyEnvelope(state, {id: randomUUID(), time: 0, action}); assert.equal(result.error, undefined); return result.state;
}
const send = (state: Exercise, command: RadarSpeedInstruction) => act(state, {kind: "command", aircraftId: "a", frequency: openingFrequency(state), command, text: "not authoritative"});
const assign = (state: Exercise, command: RadarSpeedInstruction) => act(state, {kind: "maneuver", aircraftId: "a", command});
test("strip menu has the reference heading, altitude and speed hierarchy", () => {
  const state = fixture(), roots = catalogFor(getAirport(state), state.radarEnvironment).messageMenu("approach", state.aircraft[0]);
  const vectors = roots[0].children!; assert.deepEqual(HEADING_CHOICES, Array.from({length: 36}, (_, i) => (i + 1) * 10));
  assert.deepEqual(vectors.map(p => p.label), ["Altitude and Heading", "Altitude", "Heading", "Continue as filed", "Resume own Navigation"]);
  assert.equal(vectors[2].children!.length, 36); assert.equal(vectors[2].children![0].label, "010"); assert.equal(vectors[2].children![35].label, "360");
  assert.equal(vectors[1].children!.flatMap(p => p.children ?? []).length, 69);
  const speed = radarSpeedMenu(); assert.deepEqual(speed.map(p => p.label), ["Maintain Speed", "Approach Speed", "Speed at your discretion", "Maintain Present Speed", "Maintain Slowest Practical Speed", "Maintain Best Forward Speed", "Adjust Speed to Follow"]);
  const ranges = speed[0].children!; assert.deepEqual(ranges.map(p => p.label), ["<= 250 kts", "> 250 kts", "Mach"]);
  assert.deepEqual(ranges.map(p => p.children!.length), [16, 15, 47]);
  assert.equal(ranges[1].children![0].label, "260kts"); assert.equal(ranges[1].children!.at(-1)!.label, "400kts");
  assert.equal(ranges[2].children![0].label, "Mach 0.53"); assert.equal(ranges[2].children!.at(-1)!.label, "Mach 0.99");
  assert.deepEqual(ranges[0].children!.at(-1)!.children!.map(p => p.label), ["Send", "Or Greater", "Or Below"]);
});
test("every speed menu leaf validates and off-list/incomplete speeds are rejected", () => {
  const visit = (entries: ReturnType<typeof radarSpeedMenu>) => {for (const entry of entries) {if (entry.instruction) assert.ok(instructionSchema.safeParse(entry.instruction).success); if (entry.children) visit(entry.children);}};
  visit(radarSpeedMenu());
  for (const command of [
    {type: "radar-speed", mode: "maintain", unit: "mach", value: .52, relation: "exact"},
    {type: "radar-speed", mode: "maintain", unit: "mach", value: .675, relation: "exact"},
    {type: "radar-speed", mode: "maintain", unit: "knots", value: 255, relation: "exact"},
    {type: "radar-speed", mode: "maintain", unit: "knots", value: 250},
    {type: "radar-speed", mode: "approach", value: 160, until: 5},
    {type: "radar-speed", mode: "discretion", value: 250},
  ]) assert.equal(instructionSchema.safeParse(command).success, false);
});
test("speed transmissions use requested numeric, Mach and final-distance phraseology", () => {
  const a = fixture().aircraft[0]; a.speed = 220;
  assert.equal(radarSpeedText(a, {type: "radar-speed", mode: "maintain", unit: "knots", value: 250, relation: "exact"}), "increase speed to 250 knots");
  a.speed = 300; assert.equal(radarSpeedText(a, {type: "radar-speed", mode: "maintain", unit: "knots", value: 250, relation: "exact"}), "reduce speed to 250 knots");
  assert.equal(radarSpeedText(a, {type: "radar-speed", mode: "maintain", unit: "mach", value: .67, relation: "minimum"}), "maintain Mach point six seven or greater");
  assert.equal(radarSpeedText(a, {type: "radar-speed", mode: "maintain", unit: "knots", value: 220, relation: "maximum"}), "do not exceed 220 knots");
  for (const [value, until, text] of [[160, 4, "one six zero knots until four"], [170, 5, "one seven zero knots until five"], [180, 6, "one eight zero knots until six"]] as const) assert.equal(radarSpeedText(a, {type: "radar-speed", mode: "approach", value, until}), `maintain ${text} mile final`);
});
for (const mode of ["approach", "center"] as const) test(`${mode}: speed instruction waits for normal readback, persists and respects session permissions`, () => {
  let state = fixture(mode); state.autoReadback = true;
  const command: RadarSpeedInstruction = {type: "radar-speed", mode: "maintain", unit: "knots", value: 220, relation: "exact"};
  state = send(state, command); assert.equal(state.aircraft[0].radar!.speed, undefined);
  assert.ok(menteeActionAllowed({kind: "command", aircraftId: "a", command, text: "", frequency: mode}, state));
  const before = autoReadbacks(advance(state, 1), 1000, randomUUID); assert.equal(before.aircraft[0].radar!.speed, undefined);
  state = autoReadbacks(advance(state, 1.5), 1500, randomUUID); assert.deepEqual(state.aircraft[0].radar!.speed, command); assert.equal(state.aircraft[0].targetSpeed, 220);
  assert.match(state.messages.at(-1)!.text, /speed to 220 knots/i); assert.deepEqual(exerciseSchema.parse(JSON.parse(JSON.stringify(state))).aircraft[0].radar!.speed, command);
  state.aircraft[0].radar!.transferred = true; assert.equal(menteeActionAllowed({kind: "command", aircraftId: "a", command, text: "", frequency: mode}, state), false);
});
test("minimum and maximum instructions preserve already compliant speeds; exact replaces the target", () => {
  let state = fixture(); state.aircraft[0].speed = 300;
  state = assign(state, {type: "radar-speed", mode: "maintain", unit: "knots", value: 250, relation: "minimum"}); assert.equal(state.aircraft[0].targetSpeed, 300);
  state = assign(state, {type: "radar-speed", mode: "maintain", unit: "knots", value: 220, relation: "maximum"}); assert.equal(state.aircraft[0].targetSpeed, 220);
  state = assign(state, {type: "radar-speed", mode: "maintain", unit: "knots", value: 250, relation: "exact"}); assert.equal(state.aircraft[0].targetSpeed, 250);
  state = assign(state, {type: "radar-speed", mode: "maintain", unit: "mach", value: .67, relation: "exact"}); assert.ok(Math.abs(trueAirspeed(state.aircraft[0].targetSpeed, state.aircraft[0].altitude, state.weather ?? EXERCISE_WEATHER) / machKnots(1, state.aircraft[0].altitude, state.weather ?? EXERCISE_WEATHER) - .67) < .001);
});
test("approach speed holds until the selected distance on final and then releases to automatic speed", () => {
  let state = fixture(); const a = state.aircraft[0], g = approachGeometry(getAirport(state), a.runway!);
  Object.assign(a, {position: {x: g.threshold.x - g.vector.x * 8, y: g.threshold.y - g.vector.y * 8}, heading: g.heading, targetHeading: g.heading});
  state = assign(state, {type: "radar-speed", mode: "approach", value: 170, until: 5});
  state = advance(state, 1); assert.equal(state.aircraft[0].targetSpeed, 170); assert.ok(state.aircraft[0].radar!.speed);
  state.aircraft[0].position = {x: g.threshold.x - g.vector.x * 4, y: g.threshold.y - g.vector.y * 4};
  const original = structuredClone(state); engineFor(state).predictAircraft(state.aircraft, 1); assert.deepEqual(state, original);
  state = advance(state, 1); assert.equal(state.aircraft[0].radar!.speed, undefined); assert.equal(state.aircraft[0].speedMode, "auto"); assert.equal(state.aircraft[0].targetSpeed, 160);
});
test("discretion releases restrictions, practical speeds set targets and follow uses the nearest aircraft ahead", () => {
  let state = fixture();
  state = assign(state, {type: "radar-speed", mode: "slowest"}); assert.equal(state.aircraft[0].targetSpeed, 135);
  state = assign(state, {type: "radar-speed", mode: "best-forward"}); assert.equal(state.aircraft[0].targetSpeed, 340);
  state = assign(state, {type: "radar-speed", mode: "discretion"}); assert.equal(state.aircraft[0].radar!.speed, undefined); assert.equal(state.aircraft[0].speedMode, "auto"); assert.equal(state.aircraft[0].targetSpeed, 250);
  const a = state.aircraft[0]; a.position = {x: 0, y: 0}; a.heading = 0;
  const leader = {...structuredClone(a), id: "leader", speed: 200, position: {x: 0, y: 3}};
  state = assign(state, {type: "radar-speed", mode: "follow"}); updateRadarSpeed(state.aircraft[0], [leader]); assert.equal(state.aircraft[0].targetSpeed, 200);
  assert.equal(KNOT_SPEEDS_LOW.length, 16); assert.equal(KNOT_SPEEDS_HIGH.length, 15); assert.equal(MACH_SPEEDS.length, 47);
});
