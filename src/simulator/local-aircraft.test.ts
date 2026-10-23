import assert from "node:assert/strict";
import test from "node:test";
import {AIRPORT_IDS, defaultRunway, getAirport, runwayEnds} from "./airports";
import {engineFor} from "./engine";
import {addLocalScenarioAircraft, availableLocalGate, createLocalAircraft, type LocalAircraftOptions} from "./local-aircraft";
import {magneticToTrue} from "./magnetic-headings";
import {advanceScenario} from "./scenario-engine";
import {blankScenario, createScenarioExercise, gatesFor, normalizeScenario, scenarioSchema, standPlacement} from "./scenarios";
import type {Leg} from "./model";

const options = (patch: Partial<LocalAircraftOptions> = {}): LocalAircraftOptions => ({placement: "final", callsign: "Easy 25", type: "A320", runway: "24",
  distance: 5, leg: "downwind", hand: "left", height: 1500, speed: 160, heading: 240, landing: "full-stop", flight: "departure", frequency: "tower", ...patch});

test("final placement follows each airport's selected runway, including reciprocal ends and elevated airports", () => {
  for (const id of AIRPORT_IDS) {
    const selection = {airport: id}, airport = getAirport(selection), engine = engineFor(selection);
    for (const end of runwayEnds(airport)) {
      const a = createLocalAircraft(selection, "arrival", options({runway: end.id}));
      const g = engine.runwayGeometry(end.id);
      assert.deepEqual(a.position, {x: g.threshold.x - g.vector.x * 5, y: g.threshold.y - g.vector.y * 5});
      assert.equal(a.heading, g.heading); assert.equal(a.targetHeading, g.heading);
      assert.equal(a.altitude, airport.elevation + 1500); assert.equal(a.clearedToLand, false);
      assert.equal(a.radar, undefined); assert.equal(a.frequency, "tower"); assert.equal(a.mode, "pattern"); assert.equal(a.leg, "final");
      const exercise = {...engine.initialExercise(), aircraft: []};
      const spawned = engine.applyEnvelope(exercise, {id: "spawn", time: 0, action: {kind: "spawn", aircraft: a}});
      assert.equal(spawned.error, undefined, `${id} ${end.id}`); assert.equal(spawned.state.aircraft.length, 1);
    }
  }
});

test("both circuits start on each requested leg and advance toward its next target", () => {
  const engine = engineFor({}), exercise = {...engine.initialExercise(), running: true};
  for (const hand of ["left", "right"] as const) for (const leg of ["upwind", "crosswind", "downwind", "base", "final"] as Leg[]) {
    const a = createLocalAircraft({}, "circuit", options({placement: "circuit", hand, leg, landing: "touch-and-go"}));
    const target = engine.patternTargets(a)[leg], before = engine.distance(a.position, target);
    const next = engine.advance({...exercise, aircraft: [a]}, .5).aircraft[0];
    assert.equal(a.hand, hand); assert.equal(a.leg, leg); assert.equal(a.landing, "touch-and-go");
    assert.ok(engine.distance(next.position, target) < before, `${hand} ${leg} follows the leg`);
    assert.equal(a.clearedToLand, false); assert.equal(a.flightPlan.length, 0);
  }
});

test("gate placement defaults to a connected free stand and keeps departures parked", () => {
  const airport = getAirport({}), engine = engineFor({}), gates = gatesFor(airport);
  const a = createLocalAircraft({}, "ground", options({placement: "gate", gateId: gates[0].id, frequency: "ground"}));
  assert.deepEqual(a.position, standPlacement(gates[0].id)!.position);
  assert.equal(a.altitude, airport.elevation); assert.equal(a.speed, 0); assert.equal(a.targetSpeed, 0); assert.equal(a.mode, "parked");
  assert.equal(a.intentions?.flight, "departure"); assert.equal(a.frequency, "ground");
  assert.notEqual(availableLocalGate({}, [a])?.id, gates[0].id);
  assert.equal(availableLocalGate({}, [{...a, active: false}])?.id, gates[0].id);
  assert.equal(availableLocalGate({}, [{...a, altitude: airport.elevation + 1000}])?.id, gates[0].id);
  const next = engine.advance({...engine.initialExercise(), aircraft: [a], running: true}, 1).aircraft[0];
  assert.deepEqual(next.position, a.position); assert.equal(next.mode, "parked");
  assert.throws(() => createLocalAircraft({}, "ground", options({placement: "gate", gateId: "unknown"})), /mapped gate/);
});

test("custom airborne placement preserves clicked coordinates and magnetic headings", () => {
  const selection = {airport: AIRPORT_IDS[AIRPORT_IDS.length - 1]}, airport = getAirport(selection), position = {x: 3, y: -4};
  const a = createLocalAircraft(selection, "custom", options({placement: "custom", position, heading: 90, runway: defaultRunway(airport), frequency: null}));
  assert.deepEqual(a.position, position); assert.notEqual(a.position, position);
  assert.equal(a.heading, magneticToTrue(90, airport)); assert.equal(a.mode, "heading"); assert.equal(a.frequency, null);
  const alternate = runwayEnds(getAirport({}))[0].id, g = engineFor({}).runwayGeometry(alternate);
  assert.deepEqual(createLocalAircraft({}, "custom", options({placement: "custom", runway: alternate})).position,
    {x: g.threshold.x - g.vector.x * 5, y: g.threshold.y - g.vector.y * 5});
});

test("new aircraft reject invalid fields and reserved flight numbers without changing input", () => {
  assert.throws(() => createLocalAircraft({}, "new", options(), ["Speedbird 25"]), /number.*reserved/);
  for (const patch of [{callsign: " "}, {type: " "}, {type: "way-too-long-aircraft-type"}, {runway: "99"}, {height: NaN}, {height: 0}, {speed: Infinity}, {speed: 79}, {distance: 0}]) {
    assert.throws(() => createLocalAircraft({}, "new", options(patch)));
  }
  assert.throws(() => createLocalAircraft({trainingStation: "EGPH:approach"}, "new", options()), /Ground & Tower/);
});

test("scenario addition preserves existing traffic and roundtrips both initial and scheduled aircraft", () => {
  const first = createLocalAircraft({}, "first", options()), initial = addLocalScenarioAircraft(blankScenario(), first, undefined, 0);
  const before = structuredClone(initial), second = createLocalAircraft({}, "second", options({callsign: "Easy 26", placement: "circuit"}));
  const draft = addLocalScenarioAircraft(initial, second, undefined, 2);
  assert.deepEqual(initial, before); assert.deepEqual(draft.aircraft[0], initial.aircraft[0]);
  const saved = normalizeScenario(scenarioSchema.parse(JSON.parse(JSON.stringify(draft))));
  assert.equal(saved.aircraft[0].initial, true); assert.equal(saved.aircraft[1].initial, false);
  const {exercise, runtime} = createScenarioExercise(saved, "session", "generation");
  assert.equal(exercise.aircraft.length, 1);
  const next = advanceScenario({...exercise, running: true}, runtime, 2, 1000).exercise;
  assert.equal(next.aircraft.length, 2); assert.ok(next.aircraft.some(a => a.callsign === second.callsign));
  assert.equal(advanceScenario(next, runtime, 1, 2000).exercise.aircraft.length, 2);
  assert.throws(() => addLocalScenarioAircraft(initial, first, undefined, 0), /reserved/);
  assert.throws(() => addLocalScenarioAircraft(initial, second, undefined, NaN), /Spawn time/);
});

test("scenario gates survive normalization; event and aircraft limits are respected", () => {
  const gate = gatesFor(getAirport({}))[0].id;
  const a = createLocalAircraft({}, "parked", options({placement: "gate", gateId: gate, frequency: "ground"}));
  const saved = scenarioSchema.parse(addLocalScenarioAircraft(blankScenario(), a, gate, 30));
  assert.equal(saved.aircraft[0].gateId, gate);
  assert.deepEqual(normalizeScenario(saved).aircraft[0].seed.position, a.position);
  const full = {...blankScenario(), aircraft: Array.from({length: 50}, () => saved.aircraft[0])};
  assert.throws(() => addLocalScenarioAircraft(full, a, gate, 0), /50/);
  const events = Array.from({length: 200}, () => saved.events[0]);
  assert.throws(() => addLocalScenarioAircraft({...blankScenario(), events}, a, gate, 30), /200/);
});
