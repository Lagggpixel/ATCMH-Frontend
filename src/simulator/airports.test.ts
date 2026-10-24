import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {airportList, airportRunways, airportStations, defaultAirport, defaultRunway, getAirport, trainingStation, runwayEnds, openingFrequency, frequenciesFor, environmentLabel} from "./airports";
import {advance, applyEnvelope, engineFor, restoreExercise} from "./engine";
import {catalogFor} from "./catalog";
import {blankScenario, createScenarioExercise, gatesFor, scenarioFromExercise, scenarioSchema, seedFromAircraft, standPlacement} from "./scenarios";
import {advanceScenario} from "./scenario-engine";
import {exerciseSchema, runwaySchema} from "./protocol";
import {planTaxiRoute} from "./taxi-routing";
import {groundGuidance} from "./ground-movement";
import {ReplayTimeline, replayDelta} from "./replays";
import {SessionService} from "./server/session-service";
import {MemoryStore} from "./session-test-store";
import type {Action} from "./model";

const send = (action: Action) => ({id: randomUUID(), time: 0, action});
test("Dublin's north runway spans every pinned centerline segment", () => {
  const airport = getAirport({airport: "EIDW"}), pair = airport.runways!.find(r => r.id === "10L/28R")!;
  const geometry = engineFor({airport: "EIDW"}).runwayGeometry("10L");
  const length = Math.hypot(geometry.departure.x - geometry.threshold.x, geometry.departure.y - geometry.threshold.y);
  assert.ok(Math.abs(length * 6076 / pair.lengthFeet! - 1) < .02, "a short displaced-threshold segment cannot replace the whole runway");
  assert.deepEqual(geometry.threshold, airport.features.find(f => f.id === "1105001551")!.points[0]);
  assert.deepEqual(geometry.departure, airport.features.find(f => f.id === "1240373477")!.points.at(-1));
});
test("saved Dublin exercises retain their original pinned runway geometry", () => {
  const selection = {airport: "EIDW", airportDataVersion: "342650e6f7fccc9fac48f6e72ed00a8c309eab5a580c5d1dc8cebbc48038a10e", trainingStation: "EIDW:approach"};
  const airport = getAirport(selection), engine = engineFor(selection), state = engine.initialExercise();
  assert.deepEqual(airport.runways![0].ends[0].point, {x: .61398, y: .38946});
  assert.notEqual(airport.dataVersion, getAirport({airport: "EIDW"}).dataVersion);
  assert.equal(restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state)))).airportDataVersion, selection.airportDataVersion);
  assert.equal(scenarioSchema.parse(scenarioFromExercise(state, "Saved Dublin")).airportDataVersion, selection.airportDataVersion);
});
for (const airport of airportList) {
  test(`${airport.icao}: new scenarios group Ground and Tower while legacy opening frequencies remain readable`, () => {
    const definition = scenarioSchema.parse(blankScenario({airport: airport.icao}));
    assert.equal(definition.trainingStation, `${airport.icao}:local`);
    const {exercise} = createScenarioExercise(definition, "local", randomUUID());
    assert.equal(exercise.trainingStation, `${airport.icao}:local`);
    assert.equal(openingFrequency(exercise), "ground");
    assert.deepEqual(Object.keys(frequenciesFor(airport)), ["departure","unicom","ground", "tower", "atis", "approach", "center"]);
    assert.equal(environmentLabel(exercise), `${airport.icao} · Ground & Tower`);
    assert.equal(openingFrequency({...exercise, trainingStation: `${airport.icao}:tower`}), "tower");
  });
  test(`${airport.icao}: pinned scenarios, scheduled requests, capture and replay retain their environment`, () => {
    const engine = engineFor({airport: airport.icao}), definition = blankScenario({airport: airport.icao, trainingStation: `${airport.icao}:tower`});
    const seed = seedFromAircraft(engine.newAircraft("air", true));
    definition.aircraft = [{key: "arrival", initial: true, seed}];
    definition.events = [{id: "request", title: "Arrival", trigger: {type: "time", at: 0}, actions: [{type: "request", aircraftKey: "arrival", requestId: "inbound-land", runway: defaultRunway(airport)}]}];
    const {exercise, runtime} = createScenarioExercise(scenarioSchema.parse(JSON.parse(JSON.stringify(definition))), "session", randomUUID());
    exercise.running = true;
    const after = advanceScenario(exercise, runtime, 1, 1000).exercise;
    assert.ok(after.messages[0].text.toLowerCase().includes(`runway ${defaultRunway(airport).toLowerCase()}`));
    assert.equal(after.airport, airport.icao); assert.equal(after.trainingStation, `${airport.icao}:tower`);
    assert.equal(after.airportDataVersion, airport.dataVersion);
    const captured = scenarioFromExercise(restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(after)))), "Captured");
    assert.equal(captured.airportDataVersion, definition.airportDataVersion); assert.equal(captured.trainingStation, definition.trainingStation);
    const replay = new ReplayTimeline(exercise, [{sequence: 1, at: 1, delta: replayDelta(exercise, after), interpolate: false}]).at(1);
    assert.deepEqual(replay, after);
    for (const pair of airportRunways(airport)) for (const end of pair.ends) {
      assert.ok(runwaySchema.safeParse(end.id).success);
      const geometry = engine.runwayGeometry(end.id);
      assert.deepEqual(geometry.departure, pair.ends.find(other => other.id !== end.id)!.point);
      assert.ok(Math.abs(((geometry.heading - end.heading + 540) % 360) - 180) < 3);
      assert.ok(Number.isFinite(engine.patternTargets({...seed, runway: end.id}).final.x));
    }
    assert.ok(catalogFor(airport).pilotRequestText({...engine.newAircraft("a", false), frequency: "ground"}, {id: "taxi-runway", label: "Request Taxi", runway: true}, defaultRunway(airport)).includes(defaultRunway(airport)));
  });

  if (airport.features.some(feature => feature.kind === "parking_position")) {
  test(`${airport.icao}: every runway has a mapped departure route from an offered stand`, () => {
    assert.ok(gatesFor(airport).length);
    for (const end of runwayEnds(airport)) {
      const route = gatesFor(airport).map(gate => planTaxiRoute(airport, standPlacement(gate.id, false, airport)!.position, end.id)).find(route => route.path);
      assert.ok(route?.path, `${end.id}: no connected route`);
      assert.equal(route.path.at(-1)!.hold, true);
      assert.ok(exerciseSchema.safeParse({...engineFor({airport: airport.icao}).initialExercise(), aircraft: [{...engineFor({airport: airport.icao}).newAircraft("route", false), taxiPath: route.path}]}).success);
    }
  });

  test(`${airport.icao}: ground traffic reaches its departure hold after explicit crossing clearances`, () => {
    const engine = engineFor({airport: airport.icao}), runway = defaultRunway(airport);
    const gate = gatesFor(airport).find(gate => planTaxiRoute(airport, standPlacement(gate.id, false, airport)!.position, runway).path)!;
    const aircraft = {...engine.newAircraft("taxi", false), ...standPlacement(gate.id, false, airport)!};
    let state = {...engine.initialExercise(), aircraft: [aircraft], running: true};
    const taxi = applyEnvelope(state, send({kind: "maneuver", aircraftId: aircraft.id, command: {type: "taxi", runway}}));
    assert.equal(taxi.error, undefined); state = taxi.state;
    for (let seconds = 0; seconds < 1200; seconds += 5) {
      state = advance(state, 5);
      const current = state.aircraft[0];
      if (!current.holding) continue;
      if (current.taxiIndex === current.taxiPath.length - 1) break;
      const crossing = applyEnvelope(state, send({kind: "maneuver", aircraftId: aircraft.id, command: {type: "cross", runway: current.taxiPath[current.taxiIndex].runway}}));
      assert.equal(crossing.error, undefined); state = crossing.state;
    }
    const final = state.aircraft[0];
    assert.equal(final.holding, true); assert.equal(final.taxiIndex, final.taxiPath.length - 1);
    assert.equal(final.runway, runway); assert.deepEqual(final.position, {x: final.taxiPath.at(-1)!.x, y: final.taxiPath.at(-1)!.y});
  });
  }
}

test("airport/station validation rejects mismatched datasets, unavailable services and nested foreign runways", () => {
  const definition = blankScenario({airport: "EGLL"});
  for (const patch of [{airport: "XXXX"}, {airportDataVersion: "missing"}, {trainingStation: "EGPH:ground"}, {trainingStation: "EGLL:atis"}, {airportDataDate: "1900-01-01"}]) assert.equal(scenarioSchema.safeParse({...definition, ...patch}).success, false);
  const exercise = engineFor(definition).initialExercise();
  for (const action of [
    {kind: "edit", aircraftId: exercise.aircraft[0].id, patch: {runway: "24"}},
    {kind: "spawn", aircraft: {...exercise.aircraft[0], id: "foreign", runway: "06"}},
    {kind: "atis", draft: {...exercise.atis, departures: ["24"]}},
    {kind: "edit", aircraftId: exercise.aircraft[0].id, patch: {taxiPath: [{x: 0, y: 0, hold: true, runway: "24"}]}},
  ] as Action[]) {const result = applyEnvelope(exercise, send(action)); assert.match(result.error!, /runway/i); assert.equal(result.state, exercise);}
  assert.throws(() => getAirport({airport: "EGLL", airportDataVersion: "other"}), /version/);
  assert.deepEqual(airportStations(getAirport({airport: "CYUL"})).filter(s => !s.available).map(s => s.service), []);
  assert.equal(trainingStation({airport: "SBBR"}).mhz, undefined);
});

test("crossing clearance releases only the correct physical runway and preserves departure runway", () => {
  const airport = getAirport({airport: "ROAH"}), engine = engineFor({airport: "ROAH"});
  const path = planTaxiRoute(airport, standPlacement(gatesFor(airport)[0].id, false, airport)!.position, "18R").path!;
  const parked = {...engine.newAircraft("parked", false), ...standPlacement(gatesFor(airport)[0].id, false, airport)!};
  for (const type of ["lineup", "takeoff"] as const) assert.match(engine.validateAssignment(parked, {type, runway: "18R"})!, /intermediate runway crossings/);
  const index = path.findIndex(p => p.runway === "18L"); assert.ok(index >= 0);
  const a = {...engine.newAircraft("crossing", false), runway: "18R", taxiPath: path, taxiIndex: index, position: path[index], holding: true};
  const state = {...engine.initialExercise(), aircraft: [a], running: true};
  assert.match(applyEnvelope(state, send({kind: "maneuver", aircraftId: a.id, command: {type: "cross", runway: "18R"}})).error!, /match/);
  for (const runway of ["18L", "36R", undefined]) {
    const result = applyEnvelope(state, send({kind: "maneuver", aircraftId: a.id, command: {type: "cross", runway}}));
    assert.equal(result.error, undefined); assert.equal(result.state.aircraft[0].runway, "18R"); assert.equal(result.state.aircraft[0].holding, false);
  }
  const atHold = advance(state, 1).aircraft[0]; assert.deepEqual(atHold.position, path[index]); assert.equal(atHold.holding, true);
});

test("SBBR ground spacing and transition validation use airport elevation", () => {
  const engine = engineFor({airport: "SBBR"}), a = engine.newAircraft("a", false), b = engine.newAircraft("b", false);
  Object.assign(a, {mode: "taxi", position: {x: 0, y: 0}, taxiPath: [{x: .2, y: 0}], taxiIndex: 0, heading: 90});
  Object.assign(b, {position: {x: .03, y: 0}, holding: true});
  assert.equal(a.altitude, 3497); assert.equal(groundGuidance(a, [a, b], 3497).travelLimit, 0);
  assert.match(engine.validateInstruction(engine.newAircraft("air", true), {type: "transition", altitude: 1500})!, /elevation/);
});

test("legacy schema-1 EGPH snapshots remain readable without modifying stored input", () => {
  const legacy = {...engineFor().initialExercise(), schema: 1 as const}; delete legacy.airport; delete legacy.airportDataVersion; delete legacy.trainingStation;
  const before = JSON.stringify(legacy), parsed = exerciseSchema.parse(JSON.parse(before));
  assert.equal(getAirport(parsed), defaultAirport); assert.equal(trainingStation(parsed).id, "EGPH:ground");
  assert.equal(restoreExercise(parsed).schema, 1); assert.equal(JSON.stringify(legacy), before);
  const scenario = {...blankScenario(), schema: 1 as const}; delete scenario.airportDataVersion; delete scenario.trainingStation;
  assert.equal(createScenarioExercise(scenarioSchema.parse(scenario), "legacy", randomUUID()).exercise.airport, "EGPH");
});

test("concurrent airports survive seat reclaim", async () => {
  const store = new MemoryStore(), service = new SessionService(store, () => 1000), actor = {accountId: "mentor", staff: true};
  const rows = await Promise.all(airportList.map(airport => service.create(actor, airport.icao, createScenarioExercise(blankScenario({airport: airport.icao, trainingStation: `${airport.icao}:tower`}), "pending", randomUUID()).exercise)));
  for (const row of rows) {
    const token = randomUUID(); const joined = await service.join(actor, row.id, "staff", token);
    await service.dispatch(actor, row.id, "staff", token, send({kind: "play"})); await service.leave(actor, row.id, "staff", token);
    const resumed = await new SessionService(store, () => 1000).join(actor, row.id, "staff", randomUUID());
    assert.equal(resumed.exercise.airport, joined.exercise.airport); assert.equal(resumed.exercise.trainingStation, `${row.airport}:tower`);
  }
});
