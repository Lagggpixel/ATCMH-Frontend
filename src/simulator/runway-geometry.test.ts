import assert from "node:assert/strict";
import test from "node:test";
import {airportList, airportRunways, getAirport} from "./airports";
import {advance, engineFor, restoreExercise} from "./engine";
import {approachGuide} from "./approach-guides";
import {exerciseSchema} from "./protocol";
import {blankScenario, scenarioFromExercise, scenarioSchema} from "./scenarios";
import {ReplayTimeline, replayDelta} from "./replays";
import notice from "../../public/simulator/data-notice.json";
import navigation from "./data/aviation.json";
import cyycLegacy from "./data/cyyc-before-axis-repair.json";
import klasLegacy from "./data/klas-before-axis-repair.json";
import lgavLegacy from "./data/lgav-before-axis-repair.json";
import nzaaLegacy from "./data/nzaa-before-axis-repair.json";
import roahLegacy from "./data/roah-before-axis-repair.json";
import scelLegacy from "./data/scel-before-axis-repair.json";

const bearing = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;
const difference = (a: number, b: number) => Math.abs((a - b + 540) % 360 - 180);
const normalize = (id: string) => id.replace(/^\d{1,2}/, number => number.padStart(2, "0"));

for (const airport of airportList) test(`${airport.icao}: every cone follows its physical mapped runway axis`, () => {
  for (const pair of airportRunways(airport)) {
    const names = pair.ends.map(end => normalize(end.id)).sort().join("/");
    const points = airport.features.filter(feature => feature.kind === "runway"
      && feature.name.split("/").map(normalize).sort().join("/") === names).flatMap(feature => feature.points);
    assert.ok(points.length >= 2, `${pair.id}: no mapped reference`);
    const engine = engineFor({airport: airport.icao}), g = engine.runwayGeometry(pair.ends[0].id);
    const along = (p: {x: number; y: number}) => p.x * g.vector.x + p.y * g.vector.y;
    points.sort((a, b) => along(a) - along(b));
    const first = points[0], last = points.at(-1)!, heading = bearing(first, last);
    assert.ok(difference(g.heading, heading) <= .35, `${pair.id}: cone diverges from pavement`);
    const dx = last.x - first.x, dy = last.y - first.y, length = Math.hypot(dx, dy);
    for (const end of pair.ends) {
      const lateralMetres = Math.abs((end.point.x - first.x) * dy - (end.point.y - first.y) * dx) / length * 1852;
      assert.ok(lateralMetres <= 20, `${end.id}: threshold offset ${lateralMetres} m`);
      const guide = approachGuide(end.id, airport);
      assert.ok(difference(bearing(guide.center, guide.threshold), engine.runwayGeometry(end.id).heading) < 1e-8);
    }
  }
});

test("ROAH uses the navigation thresholds and nearly parallel approach cones", () => {
  const airport = getAirport({airport: "ROAH"}), engine = engineFor({airport: "ROAH"});
  for (const pair of airportRunways(airport)) for (const end of pair.ends) {
    const row = navigation.rows.find(row => row.kind === "runway" && row.icao === "ROAH" && row.id === end.id)!;
    const expected = {x: (row.lon! - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (row.lat! - airport.origin.lat) * 60};
    assert.ok(Math.hypot(end.point.x - expected.x, end.point.y - expected.y) * 1852 < .02);
  }
  assert.ok(difference(engine.runwayGeometry("18L").heading, engine.runwayGeometry("18R").heading) < .03);
});

for (const legacy of [cyycLegacy, klasLegacy, lgavLegacy, nzaaLegacy, roahLegacy, scelLegacy]) test(`${legacy.icao}: corrected geometry retains saved scenario and replay versions`, () => {
  const selection = {airport: legacy.icao, airportDataVersion: legacy.dataVersion};
  assert.deepEqual(getAirport(selection).runways, legacy.runways);
  assert.notEqual(getAirport({airport: legacy.icao}).dataVersion, legacy.dataVersion);
  const state = engineFor(selection).initialExercise();
  assert.equal(restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state)))).airportDataVersion, legacy.dataVersion);
  const after = advance({...state, running: true}, 1);
  const replay = new ReplayTimeline(state, [{sequence: 1, at: 1, delta: replayDelta(state, after), interpolate: false}]).at(1);
  assert.deepEqual(replay, after);
  const captured = scenarioSchema.parse(scenarioFromExercise(state, "Saved before axis repair"));
  assert.equal(captured.airportDataVersion, legacy.dataVersion);
  assert.equal(scenarioSchema.parse(blankScenario({airport: legacy.icao})).airportDataVersion, getAirport({airport: legacy.icao}).dataVersion);
  const current = getAirport({airport: legacy.icao}), metadata = notice.airports.find(airport => airport.icao === legacy.icao)!;
  assert.equal(metadata.dataVersion, current.dataVersion);
  assert.equal(metadata.sourceDate, current.sourceDate);
  for (const pair of legacy.runways) for (const end of pair.ends) {
    assert.deepEqual(approachGuide(end.id, getAirport(selection)).threshold, end.point);
  }
});
