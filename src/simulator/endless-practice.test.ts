
import assert from "node:assert/strict";
import test from "node:test";
import {airportApproaches} from "./aviation";
import {getAirport} from "./airports";
import {plannedRouteAltitude} from "./command-navigation";
import {applyEnvelope, autoReadbacks} from "./engine";
import {aircraftColor} from "./model";
import {radarHeading} from "./radar";
import {exerciseSchema} from "./protocol";
import {endlessFallbackNavigation, pickEndlessCarrier} from "./endless/catalog";
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
const toGeo = (point: {x: number; y: number}, identifier: string) => ({
  identifier, lat: scope.origin.lat + point.y / 60, lon: scope.origin.lon + point.x / (60 * Math.cos(scope.origin.lat * Math.PI / 180)),
});

function fixture(code: string, stars = [`${code}1A`]): NavigationSource {
  const own = airportApproaches(scope, code).find(approach => approach.type === "visual")!.threshold!;
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
  assert.equal(opening.messages.length, 0);
  assert.ok(opening.aircraft.every(aircraft => aircraft.frequency === "unicom" && aircraftColor(aircraft, "approach") === "#808080"));
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
    assert.ok(enabled.length >= 25, key);
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

async function heathrowRun(issuePercent = 0, seed = 7) {
  const preset = endlessPresets["heathrow-dual"];
  const streams = preset.streams.slice(0, 2).map(stream => ({...stream, star: undefined, via: "TESTVIA"}));
  const scenario = await compileEndless({...preset, streams, issuePercent}, async code => ({
    ...fixture(code), waypoints: [{...toGeo({x: -55, y: 0}, "TESTVIA"), id: "test-via"}],
  }));
  const {exercise, runtime} = initializeEndless(scenario, seed);
  return {state: startEndless({...exercise, running: true}, runtime, 0), runtime};
}

test("a silent off-frequency arrival spawns with a complete filed route", async () => {
  const {state, runtime} = await heathrowRun();
  const arrival = state.aircraft[0];
  const {origin, destination} = runtime.scenario.streams[0].definition;
  assert.equal(arrival.frequency, "unicom");
  assert.equal(aircraftColor(arrival, "approach"), "#808080");
  assert.deepEqual(state.messages, []);
  assert.deepEqual([...new Set(arrival.flightPlan.map((point, index, plan) =>
    index === 0 || index === plan.length - 1 ? point.name : point.procedure?.type ?? "En-route"))],
  [origin, "SID", "En-route", "STAR", "Approach", destination]);
  assert.ok(arrival.flightPlan.some(point => point.name === "TESTVIA"));
  exerciseSchema.parse(state);
});

async function tunedHeathrow(seed = 7) {
  const run = await heathrowRun(0, seed);
  let {state} = run;
  const {runtime} = run;
  const initial = state.aircraft[0];
  state = {...state, aircraft: [initial]};
  runtime.draining = true;
  for (let i = 0; i < 900 && state.aircraft[0]?.frequency === "unicom"; i++) {
    state = advanceEndless(state, runtime, 1, (i + 1) * 1000);
  }
  const arrival = state.aircraft[0];
  assert.ok(arrival);
  assert.equal(arrival.frequency, "approach");
  return {state, runtime, initial, arrival};
}

test("filed VNAV descends and auto-tunes at a seeded FL185–FL200 before calling Approach", async () => {
  const thresholds = new Set<number>();
  for (const seed of [7, 11, 23]) {
    const {state, runtime, initial, arrival} = await tunedHeathrow(seed);
    const track = runtime.traffic[arrival.id];
    thresholds.add(track.tuneAltitude);
    assert.equal(initial.altitude, 25000);
    assert.ok(track.tuneAltitude >= 18500 && track.tuneAltitude <= 20000);
    assert.ok(arrival.altitude <= track.tuneAltitude && arrival.altitude >= track.tuneAltitude - 150);
    assert.ok(nmBetween(arrival.position, runtime.scenario.streams[track.stream].destination) > 35);
    const called = autoReadbacks(state, state.elapsed * 1000, () => "approach-request");
    const request = called.messages.find(message => message.request?.id === "request-approach");
    assert.equal(request?.aircraftId, arrival.id);
    assert.equal(request.frequency, "approach");
    assert.match(request.text, /requesting ILS approach/i);
  }
  assert.ok(thresholds.size >= 2);
});

test("high-profile and no-plan arrivals stay off-frequency until Guard contact or 35 NM", async () => {
  const {state, runtime} = await heathrowRun(100);
  const noPlan = state.aircraft.find(aircraft => runtime.traffic[aircraft.id].issue === "No flight plan");
  assert.ok(noPlan);
  // The first scheduled issue is High profile. Clear the opening traffic to isolate its entry.
  const scheduled = advanceEndless({...state, aircraft: []}, runtime, runtime.cursors[0], 30000);
  const high = scheduled.aircraft.find(aircraft => runtime.traffic[aircraft.id].issue === "High profile");
  assert.ok(high);
  runtime.draining = true;

  for (const [aircraft, altitude] of [[noPlan, 25000], [high, 31000]] as const) {
    const destination = runtime.scenario.streams[runtime.traffic[aircraft.id].stream].destination;
    const far = advanceEndless({...scheduled, aircraft: [aircraft]}, structuredClone(runtime), 15, 45000);
    const inbound = far.aircraft[0];
    assert.equal(inbound.altitude, altitude);
    assert.equal(inbound.frequency, "unicom");
    assert.ok(nmBetween(inbound.position, destination) > 35);
    assert.deepEqual(far.messages, []);

    const warning = applyEnvelope(far, {id: "guard-warning", time: 45000, action: {
      kind: "command", aircraftId: inbound.id, frequency: "approach", text: "Send On Guard Warning",
      command: {type: "atc", action: "guard", frequency: "approach", variant: "contact"},
    }});
    assert.equal(warning.error, undefined);
    const deadline = warning.state.aircraft[0].guardTune?.at;
    assert.ok(deadline !== undefined && deadline > far.elapsed);
    let replyId = 0;
    const nextId = () => `guard-reply-${++replyId}`;
    const waiting = advanceEndless(warning.state, structuredClone(runtime), (deadline - far.elapsed) / 2, 46000);
    assert.equal(autoReadbacks(waiting, 46000, nextId).aircraft[0].frequency, "unicom");
    const due = advanceEndless(waiting, structuredClone(runtime), deadline - waiting.elapsed + .25, 47000);
    const contacted = autoReadbacks(due, 47000, nextId);
    assert.equal(contacted.aircraft[0].frequency, "approach");
    assert.equal(contacted.aircraft[0].guardTune, undefined);

    const fromDestination = nmBetween(inbound.position, destination);
    for (const miles of [36, 34]) {
      const position = mixPoint(destination, inbound.position, miles / fromDestination);
      const near = advanceEndless({...far, aircraft: [{...inbound, position}]}, structuredClone(runtime), .25, 45250);
      assert.equal(near.aircraft[0].frequency, miles === 36 ? "unicom" : "approach");
    }
  }
});

test("a London Center arrival calls when it reaches the sector boundary", async () => {
  const preset = endlessPresets.london;
  const scenario = await compileEndless({...preset, issuePercent: 0,
    streams: [{...preset.streams[0], star: undefined}]}, async code => fixture(code));
  const {exercise, runtime} = initializeEndless(scenario, 7);
  const boundary = scenario.boundary;
  assert.ok(boundary);
  let state = startEndless({...exercise, running: true}, runtime, 0);
  const initial = state.aircraft[0];
  assert.equal(initial.frequency, "unicom");
  assert.ok(distanceToSector(boundary, initial.position) > 20);
  state = {...state, aircraft: [initial]};
  runtime.draining = true;
  for (let i = 0; i < 600 && state.aircraft[0]?.frequency === "unicom"; i++) {
    state = advanceEndless(state, runtime, 1, (i + 1) * 1000);
  }
  const arrival = state.aircraft[0];
  assert.ok(arrival);
  assert.equal(arrival.frequency, "center");
  const track = runtime.traffic[arrival.id];
  assert.ok(arrival.altitude > track.tuneAltitude);
  assert.ok(insideSector(boundary, arrival.position) || distanceToSector(boundary, arrival.position) <= track.tuneBoundaryOffset);
  const called = autoReadbacks(state, state.elapsed * 1000, () => "center-request");
  const request = called.messages.find(message => message.request?.id === "request-approach");
  assert.equal(request?.aircraftId, arrival.id);
  assert.equal(request.frequency, "center");
});

test("Continue as filed is accepted on Approach and VNAV holds the floor until clearance", async () => {
  const {state, runtime, arrival} = await tunedHeathrow();
  const sent = applyEnvelope(state, {id: "filed", time: state.elapsed * 1000, action: {
    kind: "command", aircraftId: arrival.id, frequency: "approach", text: "Continue as filed",
    command: {type: "atc", action: "navigation", variant: "filed"},
  }});
  assert.equal(sent.error, undefined);
  const deadline = sent.state.messages.find(message => message.id === "filed")?.autoReadbackAt;
  assert.ok(deadline !== undefined);
  let replyId = 0;
  const due = advanceEndless(sent.state, runtime, deadline - state.elapsed + .25, deadline * 1000);
  const accepted = autoReadbacks(due, due.elapsed * 1000, () => `filed-reply-${++replyId}`);
  const reply = accepted.messages.find(message => message.commandId === "filed");
  assert.match(reply?.text ?? "", /^Continue as filed/i);
  const plane = accepted.aircraft[0];
  assert.equal(plane.radar?.navigation, "route");
  const radar = plane.radar;
  const floor = radar.vnavFloor;
  assert.ok(floor !== undefined && radar.requestedApproach);
  assert.equal(radar.cleared, undefined);

  // Isolate the last filed leg with a lower target so the floor is the limiting constraint.
  const destination = plane.flightPlan.at(-1)!;
  const position = mixPoint(destination, plane.flightPlan.at(-2)!, .5);
  const heading = radarHeading(position, destination);
  const final = {...plane, position, heading, targetHeading: heading, altitude: floor,
    flightPlan: [...plane.flightPlan.slice(0, -1), {...destination, altitude: floor - 1000}],
    radar: {...radar, routeIndex: plane.flightPlan.length - 1, routeDescending: true}};
  const held = advanceEndless({...accepted, aircraft: [final]}, runtime, 1, (accepted.elapsed + 1) * 1000).aircraft[0];
  assert.equal(held.altitude, floor);
  assert.deepEqual(held.radar?.targetAltitude, {unit: "feet", value: floor});
  assert.equal(plannedRouteAltitude({...held, radar: {...held.radar!, cleared: radar.requestedApproach}}).target, floor - 1000);
});

test("an available RNAV procedure drives both the filed route and the automatic approach request", async () => {
  const preset = endlessPresets["istanbul-point-merge"];
  const definition = {...preset, streams: [preset.streams[0]], issuePercent: 0};
  const scenario = await compileEndless(definition, async code => {
    const source = endlessFallbackNavigation(code)!;
    return {...source, procedures: source.procedures.map(procedure => procedure.type === "Approach"
      ? {...procedure, identifier: "RNAV 35R", approachType: "RNAV"} : procedure)};
  });
  const {exercise, runtime} = initializeEndless(scenario, 5);
  const opening = startEndless({...exercise, running: true}, runtime, 0);
  const plane = opening.aircraft[0];
  assert.ok(plane.flightPlan.some(point => point.procedure?.name === "RNAV 35R"));
  assert.equal(plane.radar?.requestedApproach, "gps-35R");
  plane.frequency = "approach";
  const called = autoReadbacks(opening, 1000, () => "approach-request");
  assert.match(called.messages.at(-1)?.text ?? "", /requesting GPS approach at LTFM/);
});

for (const {key, airport, runways, mergeSpeed, arc, carriers} of [
  {key: "istanbul-point-merge", airport: "LTFM", runways: {"35R": "VASTE", "34L": "EVBIR"},
    mergeSpeed: 220, arc: /^FM[4578]\d{2}$/, carriers: ["Turkish", "Sunturk"]},
  {key: "haneda-point-merge", airport: "RJTT", runways: {"16L": "SHAFT", "16R": "NEURO"},
    mergeSpeed: 210, arc: /^(SOLAR|SCOUT|ALDEN|SALLY)$/, carriers: ["All Nippon", "Japan Air"]},
]) {
  test(`${key} compiles offline with both runway flows, arc speeds and regional carriers`, async () => {
    const scenario = await compileEndless(endlessPresets[key], async () => {throw new Error("Offline");});
    assert.equal(scenario.definition.airport, airport);
    assert.match(scenario.revisions[airport], /^endless-v1:/);
    assert.equal(scenario.streams.length, 10);
    assert.ok(scenario.streams.every(({definition}) => definition.kind === "arrival"));
    assert.deepEqual(new Set(scenario.streams.map(({definition}) => definition.runway)), new Set(Object.keys(runways)));
    for (const [runway, merge] of Object.entries(runways)) {
      const streams = scenario.streams.filter(({definition}) => definition.runway === runway);
      assert.equal(streams.reduce((rate, {definition}) => rate + definition.rate, 0), 32);
      const variants = streams.flatMap(stream => stream.variants);
      assert.ok(variants.every(({points}) => points.some(point => point.name === merge && point.speed === mergeSpeed)));
      assert.ok(variants.some(({points}) => points.some(point => arc.test(point.name ?? "") && point.speed === 230)));
    }
    const stream = scenario.streams[0].definition;
    const callsigns = Array.from({length: 24}, (_, entropy) => pickEndlessCarrier(airport, stream, entropy, entropy + 1).callsign);
    assert.ok(carriers.every(carrier => callsigns.some(callsign => callsign.startsWith(`${carrier} `))));
    const {exercise, runtime} = initializeEndless(scenario, 7);
    const opening = startEndless({...exercise, running: true}, runtime, 0);
    assert.ok(opening.aircraft.length > 0);
    exerciseSchema.parse(opening);
  });
}

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
