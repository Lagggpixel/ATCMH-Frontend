
import assert from "node:assert/strict";
import test from "node:test";
import {airportApproaches} from "./aviation";
import {getAirport} from "./airports";
import {exerciseSchema} from "./protocol";
import {compileEndless} from "./endless/compile";
import {endlessPresets} from "./endless/definition";
import {advanceEndless, endlessReport, initializeEndless, startEndless} from "./endless/runtime";
import {approachEntry, distanceToSector, insideSector, mixPoint, nmBetween, sectorEntry} from "./endless/geometry";
import type {NavigationSource} from "./server/navigation-api";

const ring = [{x: -20, y: -20}, {x: 20, y: -20}, {x: 20, y: 20}, {x: -20, y: 20}];
test("entries are on the unflown route, measured from the destination or sector boundary", () => {
  const entry = sectorEntry(ring, [{x: -100, y: 0}, {x: -30, y: 0}, {x: 15, y: 0}]);
  assert.ok(entry);
  assert.equal(entry.index, 1);
  assert.equal(insideSector(ring, entry.position), false);
  assert.ok(Math.abs(distanceToSector(ring, entry.position) - 25) < .001);
  const arrival = approachEntry([{x: 135, y: 15}, {x: 65, y: 15}, {x: 0, y: 0}], {x: 0, y: 0}, 76);
  assert.equal(arrival?.index, 1);
  assert.ok(Math.abs(nmBetween(arrival!.position, {x: 0, y: 0}) - 76) < .001);
});

const scope = getAirport({airport: "EGLL"});
function fixture(code: string): NavigationSource {
  const own = airportApproaches(scope, code).find(approach => approach.type === "visual")!.threshold!;
  const toGeo = (point: {x: number; y: number}, identifier: string) => ({
    identifier, lat: scope.origin.lat + point.y / 60, lon: scope.origin.lon + point.x / (60 * Math.cos(scope.origin.lat * Math.PI / 180)),
  });
  return {version: 1, icao: code, revision: "test-nav", waypoints: [], procedures: [
    {id: `${code}-sid`, identifier: `${code}1D`, type: "SID", routes: [{id: `${code}-sid-route`, transition: null,
      points: [toGeo(own, code), toGeo(mixPoint(own, {x: 0, y: 0}, .1), "SIDEND")]}]},
    {id: `${code}-star`, identifier: `${code}1A`, type: "STAR", routes: [{id: `${code}-star-route`, transition: null,
      points: [{...toGeo({x: own.x - 30, y: own.y}, "STARIN"), altitudeConstraint: {min: 6000, max: 12000}}, toGeo(own, "STAROUT")]}]},
  ]};
}

test("Approach starts with three FL250 tracks, schedules staggered runway offers, and preserves a paused run", async () => {
  const scenario = await compileEndless(endlessPresets["heathrow-dual"], async code => fixture(code));
  const {exercise, runtime} = initializeEndless(scenario, 7);
  const opening = startEndless({...exercise, id: "practice", running: true}, runtime, 0);
  assert.equal(opening.aircraft.length, 3);
  assert.deepEqual(runtime.cursors, [60, 90]);
  assert.deepEqual(opening.aircraft.map(aircraft => aircraft.altitude), [25000, 25000, 25000]);
  assert.ok(opening.aircraft.every(aircraft => nmBetween(aircraft.position, {x: 0, y: 0}) >= 75));
  assert.equal(opening.aircraft.filter(aircraft => aircraft.flightPlan.length).length, 2);
  assert.ok(opening.aircraft.some(aircraft => aircraft.flightPlan.some(point => point.altitudeConstraint?.max === 12000)));
  exerciseSchema.parse(opening);
  const recovered = JSON.parse(JSON.stringify(runtime)) as typeof runtime;
  const paused = {...opening, running: false};
  assert.strictEqual(advanceEndless(paused, recovered, 3600, 3600000), paused);
  assert.deepEqual(recovered.cursors, [60, 90]);
  const resumed = advanceEndless({...paused, running: true}, recovered, 60, 3660000);
  assert.ok(Math.abs(resumed.elapsed - 60) < .001);
  assert.deepEqual(recovered.cursors, [120, 90]);
  assert.equal(recovered.counts.released + recovered.counts.skipped, 4);
  exerciseSchema.parse(resumed);
  recovered.draining = true;
  advanceEndless(resumed, recovered, 90, 3750000);
  assert.deepEqual(recovered.cursors, [120, 90]);
});

test("local traffic uses connected stands and the score counts completions separately from skipped demand", async () => {
  const scenario = await compileEndless(endlessPresets.edinburgh, async () => {throw new Error("Local mode uses mapped data.");});
  const {exercise, runtime} = initializeEndless(scenario, 23);
  assert.equal(endlessReport(runtime, 0).score, null);
  const running = startEndless({...exercise, running: true}, runtime, 0);
  const first = advanceEndless(running, runtime, 10, 10000);
  assert.equal(first.aircraft.length, 1);
  assert.equal(first.aircraft[0].mode, "parked");
  assert.equal(first.aircraft[0].frequency, "ground");
  assert.equal(first.messages[0].request?.id, "pushback");
  exerciseSchema.parse(first);
  runtime.counts.skipped += 5;
  assert.equal(endlessReport(runtime, 300).score, 75);
  runtime.counts.completed++;
  runtime.counts.separation++;
  runtime.counts.runway++;
  assert.equal(endlessReport(runtime, 300).score, 75);
  runtime.counts.collisions++;
  assert.equal(endlessReport(runtime, 300).score, 49);
});
