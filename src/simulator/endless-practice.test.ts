
import assert from "node:assert/strict";
import test from "node:test";
import {airportApproaches} from "./aviation";
import {getAirport} from "./airports";
import {exerciseSchema} from "./protocol";
import {compileEndless} from "./endless/compile";
import {endlessDefinition, endlessPresets, maxEndlessStreams} from "./endless/definition";
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
function fixture(code: string, stars = [`${code}1A`]): NavigationSource {
  const own = airportApproaches(scope, code).find(approach => approach.type === "visual")!.threshold!;
  const toGeo = (point: {x: number; y: number}, identifier: string) => ({
    identifier, lat: scope.origin.lat + point.y / 60, lon: scope.origin.lon + point.x / (60 * Math.cos(scope.origin.lat * Math.PI / 180)),
  });
  return {version: 1, icao: code, revision: "test-nav", waypoints: [], procedures: [
    {id: `${code}-sid`, identifier: `${code}1D`, type: "SID", routes: [{id: `${code}-sid-route`, transition: null,
      points: [toGeo(own, code), toGeo(mixPoint(own, {x: 0, y: 0}, .1), "SIDEND")]}]},
    ...stars.map((identifier): NavigationSource["procedures"][number] => ({
      id: `${code}-${identifier}`, identifier, type: "STAR",
      routes: [{id: `${code}-${identifier}-route`, transition: null,
        points: [{...toGeo({x: own.x - 30, y: own.y}, "STARIN"), altitudeConstraint: {min: 6000, max: 12000}}, toGeo(own, "STAROUT")]}],
    })),
  ]};
}

test("Approach starts with three FL250 tracks, schedules staggered runway offers, and preserves a paused run", async () => {
  const preset = endlessPresets["heathrow-dual"];
  const scenario = await compileEndless({...preset, streams: preset.streams.slice(0, 2).map(stream => ({...stream, rate: 60, star: undefined}))}, async code => fixture(code));
  const {exercise, runtime} = initializeEndless(scenario, 7);
  const opening = startEndless({...exercise, id: "practice", running: true}, runtime, 0);
  assert.equal(opening.aircraft.length, 3);
  assert.deepEqual(runtime.cursors, [30, 60]);
  assert.deepEqual(opening.aircraft.map(aircraft => aircraft.altitude), [25000, 25000, 25000]);
  assert.ok(opening.aircraft.every(aircraft => nmBetween(aircraft.position, {x: 0, y: 0}) >= 75));
  assert.equal(opening.aircraft.filter(aircraft => aircraft.flightPlan.length).length, 2);
  assert.ok(opening.aircraft.some(aircraft => aircraft.flightPlan.some(point => point.altitudeConstraint?.max === 12000)));
  exerciseSchema.parse(opening);
  const recovered = JSON.parse(JSON.stringify(runtime)) as typeof runtime;
  const paused = {...opening, running: false};
  assert.strictEqual(advanceEndless(paused, recovered, 3600, 3600000), paused);
  assert.deepEqual(recovered.cursors, [30, 60]);
  const resumed = advanceEndless({...paused, running: true}, recovered, 30, 3630000);
  assert.ok(Math.abs(resumed.elapsed - 30) < .001);
  assert.deepEqual(recovered.cursors, [90, 60]);
  assert.equal(recovered.counts.released + recovered.counts.skipped, 4);
  exerciseSchema.parse(resumed);
  recovered.draining = true;
  advanceEndless(resumed, recovered, 90, 3750000);
  assert.deepEqual(recovered.cursors, [90, 60]);
});

test("radar presets offer at least 25 distinct enabled streams at their established traffic rates", async () => {
  for (const [key, count, hourlyRate] of [["heathrow-single", 30, 60], ["heathrow-dual", 30, 120], ["london", 26, 30]] as const) {
    const preset = endlessDefinition.parse(endlessPresets[key]);
    const enabled = preset.streams.filter(stream => stream.rate > 0);
    assert.equal(enabled.length, count, key);
    assert.equal(new Set(enabled.map(stream => [stream.origin, stream.destination, stream.runway, stream.star].join("/"))).size, count, key);
    assert.equal(enabled.reduce((total, stream) => total + stream.rate, 0), hourlyRate, key);
  }

  const preset = endlessPresets["heathrow-dual"];
  const stars = [...new Set(preset.streams.flatMap(stream => stream.star ? [stream.star] : []))];
  const scenario = await compileEndless(preset, async code => fixture(code, code === preset.airport ? stars : undefined));
  assert.equal(scenario.streams.length, 30);
  assert.deepEqual(scenario.streams.map(stream => stream.firstAt), Array.from({length: 30}, (_, index) => 30 * (index + 1)));
  assert.ok(scenario.streams.every(stream => stream.interval === 900));
  assert.ok(scenario.streams.every(({definition, variants}) => variants.every(variant => variant.star === definition.star)));

  const streams = Array.from({length: maxEndlessStreams}, () => preset.streams[0]);
  assert.ok(endlessDefinition.safeParse({...preset, streams}).success);
  assert.equal(endlessDefinition.safeParse({...preset, streams: [...streams, streams[0]]}).success, false);
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
