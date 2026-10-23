import {magneticToTrue} from "./magnetic-headings";
import assert from "node:assert/strict";
import test from "node:test";
import {engineFor, restoreExercise} from "./engine";
import {airportList, getAirport} from "./airports";
import {approachGeometry, assignRadar, headingDifference, moveRadar, radarEnvironmentFor, radarGuidanceLabel} from "./radar";
import {exerciseSchema} from "./protocol";
import {ReplayTimeline, replayDelta} from "./replays";
import type {ApproachType} from "./model";

function fixture(type: ApproachType, lateral = 0, intercept = 0, nm = 10, airportCode = "EGPH", runway?: string) {
  const state = engineFor({airport: airportCode, trainingStation: `${airportCode}:approach`}).initialExercise();
  const airport = getAirport(state), environment = state.radarEnvironment!;
  const approach = environment.approaches.find(p => p.type === type && (!runway || p.runway === runway))!;
  const g = approachGeometry(airport, approach.runway), a = state.aircraft[0];
  const altitude = Math.max(2500, Math.ceil((airport.elevation + 2200) / 500) * 500);
  Object.assign(a, {position: {x: g.threshold.x - g.vector.x * nm - g.vector.y * lateral, y: g.threshold.y - g.vector.y * nm + g.vector.x * lateral},
    heading: (g.heading + intercept + 360) % 360, targetHeading: (g.heading + intercept + 360) % 360,
    altitude, speed: 180, targetSpeed: 180, speedMode: "manual", active: true});
  assignRadar(a, {type: "expect-approach", approachId: approach.id}, airport, environment);
  assignRadar(a, {type: "vector", approachId: approach.id, altitude: {unit: "feet", value: altitude}}, airport, environment);
  const fly = (seconds: number, automatic = true) => {for (let t = 0; t < seconds - 1e-8; t += .05) moveRadar(a, .05, airport, environment, [], automatic);};
  const position = () => {const dx = a.position.x - g.threshold.x, dy = a.position.y - g.threshold.y;return {along: dx * g.vector.x + dy * g.vector.y, lateral: dx * -g.vector.y + dy * g.vector.x};};
  return {state, a, airport, environment, approach, g, fly, position};
}

test("ILS holds assigned altitude on LOC, then captures and descends on GS from below", () => {
  const f = fixture("ils"); f.fly(1);
  assert.equal(f.a.radar!.localizer, true);
  assert.equal(f.a.radar!.glideslope, false);
  assert.equal(radarGuidanceLabel(f.a, f.environment), "LOC");
  assert.equal(f.a.radar!.captured, false);
  assert.equal(f.a.altitude, 2500, "localizer guidance must not climb to the glideslope");
  const locSnapshot = structuredClone(f.state);
  assert.equal(restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(locSnapshot)))).aircraft[0].radar!.glideslope, false);
  f.fly(80);
  assert.equal(f.a.radar!.captured, true);
  assert.equal(f.a.radar!.glideslope, true);
  assert.equal(radarGuidanceLabel(f.a, f.environment), "LOC · GS");
  assert.ok(f.a.altitude < 2500);
  assert.ok(Math.abs(f.position().lateral) < .05);
  const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(f.state))));
  assert.equal(restored.aircraft[0].radar!.localizer, true);
  assert.equal(restored.aircraft[0].radar!.captured, true);
  assert.equal(restored.aircraft[0].radar!.glideslope, true);
  const replay = new ReplayTimeline(locSnapshot, [{sequence: 1, at: 80, delta: replayDelta(locSnapshot, f.state), interpolate: false}]);
  assert.equal(replay.at(80).aircraft[0].radar!.glideslope, true);
});
for (const airport of airportList) for (const approach of radarEnvironmentFor(airport).approaches) test(`${airport.icao} ${approach.id}: tracks final and descends after clearance`, () => {
  const f = fixture(approach.type, 1, approach.type === "ils" ? 30 : 0, 12, airport.icao, approach.runway), initialAltitude = f.a.altitude;
  f.fly(180);
  assert.equal(f.a.radar!.navigation, "approach");
  assert.equal(f.a.radar!.captured, true);
  assert.ok(Math.abs(f.position().lateral) < .1);
  if(approach.type === "ils" && approach.glideslope===false)assert.equal(f.a.altitude,initialAltitude,"localizer-only equipment cannot provide vertical guidance");
  else assert.ok(f.a.altitude < initialAltitude);
  if (approach.type === "ils") {assert.equal(f.a.radar!.localizer, true); if(approach.glideslope!==false)assert.equal(f.a.radar!.glideslope, true);}
});
for (const side of [-1, 1]) test(`ILS captures a ${side * 30} degree intercept and tracks the centerline`, () => {
  const f = fixture("ils", side * 1.5, side * 30); f.fly(180);
  assert.equal(f.a.radar!.localizer, true);
  assert.equal(f.a.radar!.captured, true);
  assert.ok(Math.abs(f.position().lateral) < .05, `cross-track ${f.position().lateral}`);
  assert.ok(Math.abs(headingDifference(f.g.heading, f.a.heading)) < 3);
});
for (const type of ["gps", "visual"] as const) for (const side of [-1, 1]) test(`${type} joins and descends on final from an offset on side ${side}`, () => {
  const f = fixture(type, side * 2, 0); f.fly(150);
  assert.equal(f.a.radar!.captured, true);
  assert.equal(f.a.radar!.navigation, "approach");
  assert.ok(Math.abs(f.position().lateral) < .1, `cross-track ${f.position().lateral}`);
  assert.ok(f.a.altitude < 2500);
});
test("radar vectors preserve heading and altitude and cancel automatic approach capture", () => {
  const f = fixture("ils"); f.fly(1);
  assignRadar(f.a, {type: "expect-approach", approachId: null, vectors: true}, f.airport, f.environment);
  assignRadar(f.a, {type: "vector", heading: 90, altitude: {unit: "feet", value: 3500}}, f.airport, f.environment);
  f.fly(120);
  assert.equal(f.a.radar!.navigation, "heading");
  assert.equal(f.a.radar!.captured, false);
  assert.equal(f.a.radar!.localizer, false);
  assert.equal(f.a.radar!.glideslope, false);
  assert.equal(radarGuidanceLabel(f.a, f.environment), "Radar vectors");
  assert.equal(f.a.altitude, 3500);
  assert.equal(f.a.heading, magneticToTrue(90, f.airport));
});
