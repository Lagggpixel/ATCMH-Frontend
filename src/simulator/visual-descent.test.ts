import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor, applyEnvelope, advance, autoReadbacks, restoreExercise} from "./engine";
import {getAirport} from "./airports";
import {approachGeometry, assignRadar, moveRadar, visualApproachTrackMiles, visualClearanceUnable} from "./radar";
import {visualDescentDistance, visualDescentHeight} from "./visual-descent";
import {EXERCISE_WEATHER, type Exercise, type Instruction} from "./model";
import {exerciseSchema} from "./protocol";

const calm = {...EXERCISE_WEATHER, windSpeed: 0};
function fixture(icao = "EGPH", height = 2000, miles = 5.5, lateral = 0) {
  const state = engineFor({airport: icao, trainingStation: `${icao}:approach`, weather: calm}).initialExercise();
  const airport = getAirport(state), a = state.aircraft[0], environment = state.radarEnvironment!;
  const p = environment.approaches.find(p => p.type === "visual")!, g = approachGeometry(airport, p.runway, p);
  Object.assign(a, {position: {x: g.threshold.x - g.vector.x * miles - g.vector.y * lateral, y: g.threshold.y - g.vector.y * miles + g.vector.x * lateral},
    heading: (g.heading + (lateral ? Math.sign(lateral) * 90 : 0) + 360) % 360, targetHeading: (g.heading + (lateral ? Math.sign(lateral) * 90 : 0) + 360) % 360,
    altitude: airport.elevation + height, speed: 180, targetSpeed: 180});
  a.radar!.expected = p.id; delete a.radar!.report;
  state.running = true; state.autoReadback = true;
  const command: Extract<Instruction, {type: "vector"}> = {type: "vector", approachId: p.id};
  return {state, airport, a, environment, command, g};
}
function send(state: Exercise, command: Instruction) {
  const result = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: state.aircraft[0].id, frequency: "approach", text: "", command}});
  assert.equal(result.error, undefined); return result.state;
}
for (const height of [0, 500, 999, 1000, 1001, 2000, 3000, 5000]) test(`${height}ft: two-stage descent distance and height are inverses`, () => {
  assert.ok(Math.abs(visualDescentHeight(visualDescentDistance(height)) - height) < 1e-8);
});
test("2000ft uses separate 4-degree and 3-degree segments to runway ground", () => {
  const expected = 1000 / (6076.12 * Math.tan(4 * Math.PI / 180)) + 1000 / (6076.12 * Math.tan(3 * Math.PI / 180));
  assert.equal(visualDescentDistance(2000), expected);
  assert.ok(Math.abs(expected - 5.4939341133) < 1e-8);
  assert.equal(visualDescentDistance(-100), 0);
});
for (const icao of ["EGPH", "KASE"]) for (const height of [500, 1000, 2000, 5000]) test(`${icao} ${height}ft: equality accepted and insufficient track rejected`, () => {
  const f = fixture(icao, height, visualDescentDistance(height));
  const before = structuredClone(f.a);
  assert.equal(visualClearanceUnable(f.a, f.command, f.airport, f.environment, calm), null);
  assert.deepEqual(f.a, before, "prediction cannot mutate live traffic");
  f.a.altitude += 20;
  assert.match(visualClearanceUnable(f.a, f.command, f.airport, f.environment, calm)!, /Insufficient visual approach track miles/);
});
test("a banked base join credits flown distance rather than the direct shortcut or unused flight plan", () => {
  const f = fixture("EGPH", 2300, 5.5, 2);
  const track = visualApproachTrackMiles(f.a, f.command, f.airport, f.environment, calm);
  const direct = Math.hypot(5.5, 2);
  assert.ok(track > direct + .3);
  assert.ok(visualDescentDistance(2300) > direct && visualDescentDistance(2300) < track);
  assert.equal(visualClearanceUnable(f.a, f.command, f.airport, f.environment, calm), null);
  f.a.flightPlan = [{x: 1000, y: 1000}, {...f.g.threshold}];
  assert.equal(visualApproachTrackMiles(f.a, f.command, f.airport, f.environment, calm), track);
});
test("automatic Unable leaves the previous lateral/vertical targets and clearance intact", () => {
  const f = fixture("EGPH", 3000, 5.5), previous = structuredClone(f.a);
  let state = send(f.state, f.command);
  state = autoReadbacks(advance(state, 1.5), 1500, randomUUID);
  const a = state.aircraft[0], reply = state.messages.find(m => m.commandId === state.messages[0].id)!;
  assert.match(reply.text, /^Unable/); assert.match(reply.unableReason!, /4° above 1,000 ft, 3° below/);
  assert.equal(a.radar!.navigation, previous.radar!.navigation);
  assert.equal(a.radar!.cleared, previous.radar!.cleared);
  assert.equal(a.targetHeading, previous.targetHeading);
  assert.deepEqual(a.radar!.targetAltitude, previous.radar!.targetAltitude);
  assert.equal(a.radar!.missedApproach, undefined);
});
test("feasible readback assigns visual clearance; manual assignment remains available", () => {
  const f = fixture("EGPH", 2000, 5.7); let state = send(f.state, f.command);
  state = autoReadbacks(advance(state, 1.5), 1500, randomUUID);
  assert.equal(state.aircraft[0].radar!.cleared, f.command.approachId);
  assert.doesNotMatch(state.messages.at(-1)!.text, /^Unable/);
  const manual = fixture("EGPH", 4000, 5.5); manual.state.autoReadback = false;
  state = send(manual.state, manual.command);
  const result = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "pilot", aircraftId: manual.a.id, replyTo: state.messages[0].id, text: "Readback", assign: true}});
  assert.equal(result.error, undefined); assert.equal(result.state.aircraft[0].radar!.cleared, manual.command.approachId);
});
for (const lateral of [0, 2, -2]) test(`accepted ${lateral}NM base/final path captures and lands after restore`, () => {
  const f = fixture("EGPH", lateral ? 2300 : 2000, 5.5, lateral);
  assert.equal(visualClearanceUnable(f.a, f.command, f.airport, f.environment, calm), null);
  assignRadar(f.a, f.command, f.airport, f.environment);
  f.a.frequency = "tower"; f.a.radar!.transferred = true;
  const state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(f.state)))), a = state.aircraft[0];
  for (let t = 0; t < 350 && !a.radar!.arrival && a.radar!.navigation !== "missed"; t += .05) moveRadar(a, .05, f.airport, f.environment, [], true, calm);
  assert.equal(a.radar!.arrival?.phase, "rollout");
  assert.notEqual(a.radar!.navigation, "missed");
});
