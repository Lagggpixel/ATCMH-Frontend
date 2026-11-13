import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor} from "./engine";
import {aircraftSchema, exerciseSchema, routeAltitudeConstraintSchema} from "./protocol";
import {addedFlightPlanPatch, appendFlightPlan, flightPlanPatch, legAltitudeLabel, tagProcedure, typedRoutePoints} from "./scenario-flight-plan";
import {flightPlanText} from "./aircraft-information";
import {createNavigationApi, type NavigationSource} from "./server/navigation-api";
import {getAirport} from "./airports";
import {blankScenario, createScenarioExercise, scenarioSchema, seedFromAircraft} from "./scenarios";
import type {Instruction, RoutePoint} from "./model";

test("procedure restrictions survive navigation import, typed routes, scenario saving and replay snapshots", async () => {
  const airport = getAirport({airport: "EGPH"});
  const constraints = [{min: 4321, max: 4321}, {min: 6400}, {max: 875}, {min: 19000, max: 21000}, undefined];
  for (const type of ["SID", "STAR", "Approach"] as const) {
    const points = constraints.map((altitudeConstraint, i) => ({identifier: `P${i}`, lat: airport.origin.lat + i / 60, lon: airport.origin.lon, ...(altitudeConstraint ? {altitudeConstraint} : {})}));
    const source: NavigationSource = {version: 1, icao: "EGPH", revision: `altitude-${type}`, waypoints: [], procedures: [{id: "proc", identifier: "TEST", type, routes: [{id: "route", transition: null, points}]}]};
    const api = createNavigationApi(async () => source, async () => ({accountId: "trainer", staff: true}));
    const request = (route = false) => new Request(`https://test/api/simulator/navigation?airport=EGPH${route ? `&route=route&revision=${source.revision}` : ""}`);
    const catalog = await (await api(request())).json();
    const route = await (await api(request(true))).json();
    assert.deepEqual(route.points.map((p: RoutePoint) => p.altitudeConstraint), constraints);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json(route);
    try {
      const resolved = await typedRoutePoints(catalog, [{name: "TEST", procedure: catalog.procedures[0], route: catalog.procedures[0].routes[0]}]);
      const engine = engineFor({trainingStation: "EGPH:approach"}), a = engine.initialExercise().aircraft[0];
      a.flightPlan = []; a.followRouteAltitudes = false;
      Object.assign(a, addedFlightPlanPatch(a, resolved.points));
      assert.equal(a.followRouteAltitudes, true);
      assert.deepEqual(aircraftSchema.parse(a).flightPlan.map(p => p.altitudeConstraint), constraints);
      const scenario = blankScenario({trainingStation: "EGPH:approach"});
      scenario.aircraft = [{key: "test", initial: true, seed: seedFromAircraft(a)}];
      const saved = scenarioSchema.parse(JSON.parse(JSON.stringify(scenario)));
      const state = createScenarioExercise(saved, "test", randomUUID()).exercise;
      assert.deepEqual(exerciseSchema.parse(JSON.parse(JSON.stringify(state))).aircraft[0].flightPlan.map(p => p.altitudeConstraint), constraints);
    } finally {globalThis.fetch = originalFetch;}
  }
});

test("adding procedures enables altitude following in editor and live mode; later edits preserve an opt-out", () => {
  const a = engineFor({trainingStation: "EGPH:approach"}).initialExercise().aircraft[0];
  a.flightPlan = []; a.followRouteAltitudes = false; a.radar!.navigation = "heading";
  for (const type of ["SID", "STAR", "Approach"] as const) for (const live of [false, true]) {
    const incoming = tagProcedure([{x: 20, y: 0, altitudeConstraint: {min: 4321}}], {type, name: "TEST"});
    const patch = addedFlightPlanPatch(a, incoming, live);
    assert.equal(patch.followRouteAltitudes, true);
    assert.equal(patch.radar!.navigation, live ? "heading" : "route");
    assert.equal(patch.radar!.cleared, a.radar!.cleared);
    assert.equal(flightPlanPatch({...a, flightPlan: incoming}, incoming, live).followRouteAltitudes, undefined);
  }
  assert.equal(addedFlightPlanPatch(a, [{x: 20, y: 0}], true).followRouteAltitudes, undefined);
});

test("published exact, minimum, maximum and window altitudes guide actual aircraft motion without rounding", () => {
  for (const [altitudeConstraint, start, target] of [
    [{min: 4321, max: 4321}, 5000, 4321], [{min: 6400}, 5000, 6400], [{min: 6400}, 8000, 8000],
    [{max: 4321}, 5000, 4321], [{max: 6400}, 5000, 5000], [{min: 6400, max: 9200}, 10000, 9200],
    [{min: 6400, max: 9200}, 5000, 6400], [{min: 6400, max: 9200}, 8000, 8000],
    [{min: 19123, max: 19123}, 20000, 19123], [{min: 19500, max: 19500}, 20000, 19500],
    [{min: 875, max: 875}, 1000, 875], [{min: 0, max: 0}, 1000, 0]
  ] as const) {
    const engine = engineFor({trainingStation: "EGPH:approach"}), state = engine.initialExercise();
    state.running = true; const a = state.aircraft[0];
    a.altitude = start; a.radar!.navigation = "route"; a.radar!.routeIndex = 0; delete a.radar!.targetAltitude; delete a.radar!.report;
    a.flightPlan = []; Object.assign(a, addedFlightPlanPatch(a, tagProcedure([{x: a.position.x + .1, y: a.position.y, altitudeConstraint}], {type: "STAR", name: "TEST"})));
    const next = engine.advance(state, 1), flown = next.aircraft[0];
    const height = flown.radar!.targetAltitude!;
    assert.equal(height.value * (height.unit === "flight-level" ? 100 : 1), target);
    assert.equal(Math.sign(flown.altitude - start), Math.sign(target - start));
    assert.equal(exerciseSchema.safeParse(next).success, true);
  }
});

test("route progression respects the next bound, unconstrained fixes hold the preceding target, and ATC overrides it", () => {
  const engine = engineFor({trainingStation: "EGPH:approach"}), state = engine.initialExercise(); state.running = true;
  const a = state.aircraft[0]; a.altitude = 5000; a.radar!.navigation = "route"; a.radar!.routeIndex = 0; delete a.radar!.report;
  a.flightPlan = [];
  const points = tagProcedure([{x: a.position.x + 30, y: a.position.y, altitudeConstraint: {min: 6400}}, {x: a.position.x + 60, y: a.position.y, altitudeConstraint: {max: 4321}}, {x: a.position.x + 90, y: a.position.y}], {type: "STAR", name: "TEST"});
  Object.assign(a, addedFlightPlanPatch(a, points));
  let next = engine.advance(state, 1); assert.equal(next.aircraft[0].radar!.targetAltitude?.value, 6400);
  next.aircraft[0].radar!.routeIndex = 1; next = engine.advance(next, 1);
  assert.equal(next.aircraft[0].radar!.targetAltitude?.value, 6400, "hold cruise while the lower restriction remains far ahead");
  next.aircraft[0].position = {x: points[1].x - .1, y: points[1].y}; next = engine.advance(next, 1);
  assert.equal(next.aircraft[0].radar!.targetAltitude?.value, 4321);
  next.aircraft[0].radar!.routeIndex = 2; next = engine.advance(next, 1);
  assert.equal(next.aircraft[0].radar!.targetAltitude?.value, 4321);
  const command: Instruction = {type: "vector", altitude: {unit: "feet", value: 4000}};
  const commanded = engine.applyEnvelope(next, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: a.id, command}});
  assert.equal(commanded.error, undefined);
  assert.equal(commanded.state.aircraft[0].followRouteAltitudes, undefined);
  assert.equal(engine.advance(commanded.state, 1).aircraft[0].radar!.targetAltitude?.value, 4000);
});

test("planned climb looks through unrestricted fixes, holds cruise and preserves that choice after reload", () => {
  for (const altitude of [{altitude: 6500}, {altitudeConstraint: {min: 6500, max: 6500}}, {altitudeConstraint: {min: 6500}}, {altitudeConstraint: {min: 6500, max: 9200}}]) {
    const e = engineFor({trainingStation: "EGPH:approach"});
    let s = e.initialExercise(); s.running = true; const a = s.aircraft[0]; s.aircraft = [a];
    a.altitude = 1200; a.followRouteAltitudes = true; a.cruiseAltitude = 10000;
    Object.assign(a.radar!, {navigation: "route", routeIndex: 0, climbUntilAssigned: true}); delete a.radar!.report; delete a.radar!.targetAltitude;
    a.flightPlan = [{x: a.position.x + 30, y: a.position.y}, {x: a.position.x + 60, y: a.position.y, ...altitude}, {x: a.position.x + 90, y: a.position.y}];
    s = e.advance(s, 1);
    assert.deepEqual(s.aircraft[0].radar!.targetAltitude, {unit: "feet", value: 10000});
    assert.equal(s.aircraft[0].radar!.climbUntilAssigned, undefined);
    assert.ok(s.aircraft[0].altitude > 1200);
    s = e.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(s))));
    s.aircraft[0].radar!.routeIndex = 2;
    assert.equal(e.advance(s, 1).aircraft[0].radar!.targetAltitude?.value, 10000);
  }
});

test("Continue as Filed enables a planned climb without replacing a controller altitude", () => {
  for (const command of [{type: "atc", action: "navigation", variant: "filed"}, {type: "expect-approach", approachId: "gps-24", navigation: "filed"}] as Instruction[]) {
    for (const assigned of [false, true]) {
      const e = engineFor({trainingStation: "EGPH:approach"}), s = e.initialExercise(); s.running = true;
      const a = s.aircraft[0]; s.aircraft = [a]; a.altitude = 1200; delete a.radar!.report; delete a.followRouteAltitudes;
      a.flightPlan = [{x: a.position.x, y: a.position.y - 10}, {x: a.position.x, y: a.position.y + 30}, {x: a.position.x, y: a.position.y + 60, altitude: 6400}];
      a.heading = a.targetHeading = 0; delete a.track; a.radar!.navigation = "route"; a.radar!.routeIndex = 1;
      if (assigned) {a.radar!.targetAltitude = {unit: "feet", value: 4000}; delete a.radar!.altitudeFromRoute;}
      else delete a.radar!.targetAltitude;
      const sent = e.applyEnvelope(s, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: a.id, command}});
      assert.equal(sent.error, undefined);
      const next = e.advance(sent.state, 1);
      assert.equal(next.aircraft[0].radar!.targetAltitude?.value, assigned ? 4000 : 6400);
      assert.equal(next.aircraft[0].radar!.altitudeFromRoute, assigned ? undefined : true);
      assert.equal(next.aircraft[0].radar!.cleared, undefined);
      assert.ok(next.aircraft[0].altitude > 1200);
    }
  }
});

test("joining procedure restrictions preserves both bounds, authored targets and source objects", () => {
  const existing = [{x: 1, y: 0, name: "JOIN", altitudeConstraint: {min: 6400}, altitude: 7000}];
  const incoming = [{x: 1, y: 0, name: "JOIN", altitudeConstraint: {max: 9200}}, {x: 2, y: 0}];
  const joined = appendFlightPlan(existing, incoming);
  assert.deepEqual(joined[0].altitudeConstraint, {min: 6400, max: 9200}); assert.equal(joined[0].altitude, 7000);
  assert.deepEqual(existing[0].altitudeConstraint, {min: 6400}); assert.deepEqual(incoming[0].altitudeConstraint, {max: 9200});
  assert.throws(() => appendFlightPlan(existing, [{...incoming[0], altitudeConstraint: {max: 6000}}]), /restrictions.*conflict/);
});

test("published altitude labels show restrictions and validation rejects invalid windows", () => {
  const points: RoutePoint[] = [{x: 0, y: 0, name: "EXACT", altitudeConstraint: {min: 4321, max: 4321}}, {x: 1, y: 0, name: "MIN", altitudeConstraint: {min: 6400}}, {x: 2, y: 0, name: "MAX", altitudeConstraint: {max: 875}}, {x: 3, y: 0, name: "WINDOW", altitudeConstraint: {min: 19000, max: 21000}}];
  assert.deepEqual(points.map((_, i) => legAltitudeLabel(points, i, 5000)), ["At 4,321 ft", "At or above 6,400 ft", "At or below 875 ft", "Between FL190 and FL210"]);
  assert.equal(flightPlanText(points), "EXACT(4,321), MIN(≥6,400), MAX(≤875), WINDOW(19,000–21,000)");
  for (const bounds of [{}, {min: -1}, {max: 60001}, {min: 4321.5}, {min: 7000, max: 6000}]) assert.equal(routeAltitudeConstraintSchema.safeParse(bounds).success, false);
});
