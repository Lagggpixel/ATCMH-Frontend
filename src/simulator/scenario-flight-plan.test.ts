import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {appendedFixes, appendFlightPlan, flightPlanItems, flightPlanPatch, legAltitudeLabel, moveFlightPlanItem, moveFlightPlanRange, navigationSearch, tagProcedure} from "./scenario-flight-plan";
import type {NavigationCatalog} from "./navigation-data";
import {engineFor} from "./engine";
import {scenarioTakeoffAircraft} from "./radar";
import type {DepartureAirport} from "./departure-airports";
import {getAirport} from "./airports";
import {aircraftSchema, exerciseSchema} from "./protocol";
import {blankScenario, createScenarioExercise, scenarioSchema, seedFromAircraft} from "./scenarios";
import type {Instruction} from "./model";

test("appending complete routes merges only the join, preserves constraints and loops, and enforces the limit atomically", () => {
  const first = [{name: "JOIN", x: 1, y: 1, altitude: 4000}], incoming = [{name: "JOIN", x: 1, y: 1}, {name: "LOOP", x: 2, y: 2}, {name: "JOIN", x: 1, y: 1}];
  const combined = appendFlightPlan(first, incoming);
  assert.deepEqual(combined.map(p => p.name), ["JOIN", "LOOP", "JOIN"]); assert.equal(combined[0].altitude, 4000);
  combined[0].x = 3; assert.equal(first[0].x, 1); assert.equal(incoming.length, 3);
  assert.equal(appendFlightPlan(first, [{name: "JOIN", x: 9, y: 9}]).length, 2);
  const full = Array.from({length: 200}, (_, x) => ({x, y: 0}));
  assert.throws(() => appendFlightPlan(full, [{x: 300, y: 0}]), /200 waypoints/); assert.equal(full.length, 200);
});

test("route editing starts the first filed route without assigning an approach or changing existing heading guidance", () => {
  const a = engineFor({trainingStation: "EGPH:approach"}).initialExercise().aircraft[0];
  a.flightPlan = []; a.radar!.navigation = "heading"; a.radar!.expected = undefined;
  const patch = flightPlanPatch(a, [{name: "FIX", x: 5, y: 5}]);
  assert.equal(patch.radar!.navigation, "route"); assert.equal(patch.radar!.expected, undefined); assert.equal(patch.radar!.cleared, undefined);
  a.flightPlan = patch.flightPlan!;
  assert.equal(flightPlanPatch(a, [{x: 10, y: 10}]).radar!.navigation, "heading");
  assert.equal(flightPlanPatch(a, []).radar!.navigation, "heading");
  a.flightPlan = []; a.radar!.departure = {runway: "24", phase: "roll"};
  const departure = flightPlanPatch(a, [{name: "SID", x: 5, y: 5}]);
  assert.equal(departure.radar!.navigation, "route"); assert.deepEqual(departure.radar!.departure, a.radar!.departure);
  assert.equal(departure.followRouteAltitudes, true);
});

test("leg labels compare against preceding targets and the initial altitude", () => {
  const points = [{x: 0, y: 0, altitude: 6000}, {x: 1, y: 1}, {x: 2, y: 2, altitude: 3000}, {x: 3, y: 3, altitude: 20000}];
  assert.equal(legAltitudeLabel(points, 0, 5000), "Climb to 6,000 ft");
  assert.equal(legAltitudeLabel(points, 1, 5000), "Maintain previous altitude");
  assert.equal(legAltitudeLabel(points, 2, 5000), "Descend to 3,000 ft");
  assert.equal(legAltitudeLabel(points, 3, 5000), "Climb to FL200");
});

test("unified search finds procedures by transition, keeps duplicate names distinct, and filters by type", () => {
  const catalog: NavigationCatalog = {airport: "EGPH", revision: "test", fixes: [{id: "1", name: "SAB", point: {x: 1, y: 1}}, {id: "2", name: "SAB", point: {x: 2, y: 2}}], procedures: [
    {id: "1", name: "ILS RWY 24", type: "Approach", routes: [{id: "app", name: "SAB", pointCount: 2}]},
    {id: "2", name: "TALLA1A", type: "STAR", routes: [{id: "star", name: "SAB", pointCount: 3}]},
    {id: "3", name: "GOSAM1A", type: "SID", routes: [{id: "sid", name: "GOSAM", pointCount: 2}]},
  ]};
  const all = navigationSearch(catalog, " sab ", "All");
  assert.deepEqual(all.map(item => item.type), ["Waypoint", "Waypoint", "STAR", "Approach"]);
  assert.equal(new Set(all.map(item => item.id)).size, 4);
  assert.equal(navigationSearch(catalog, "SAB", "Approach")[0].name, "ILS RWY 24");
  assert.equal(navigationSearch(catalog, "SAB", "SID").length, 0);
  assert.equal(navigationSearch(catalog, "ILS", "All")[0].procedure?.id, "1");
  assert.deepEqual(navigationSearch(undefined, "SAB", "All"), []);
});

test("search narrows the complete catalogue before limiting visible matches", () => {
  const catalog: NavigationCatalog = {airport: "EGPH", revision: "test", fixes: Array.from({length: 1001}, (_, i) => ({id: String(i), name: `FIX${i}`, point: {x: i, y: 1}})), procedures: []};
  assert.equal(navigationSearch(catalog, "", "All").length, 10);
  assert.equal(navigationSearch(catalog, "", "Waypoint").length, 40);
  assert.equal(navigationSearch(catalog, "FIX1000", "All")[0].name, "FIX1000");
  assert.equal(catalog.fixes.length, 1001);
});

function profile() {
  const engine = engineFor({trainingStation: "EGPH:approach"}), state = engine.initialExercise(); state.running = true;
  const a = state.aircraft[0]; a.altitude = 5000; a.radar!.navigation = "route"; a.radar!.routeIndex = 0;
  delete a.radar!.report; delete a.radar!.targetAltitude;
  a.flightPlan = [{name: "CLIMB", x: a.position.x + 30, y: a.position.y, altitude: 8000}, {name: "DESCENT", x: a.position.x + 60, y: a.position.y, altitude: 3000}];
  a.followRouteAltitudes = true;
  return {engine, state, a};
}

test("planned climbs and descents move the aircraft and survive scenario and replay snapshots", () => {
  const {engine, state, a} = profile();
  const definition = blankScenario({trainingStation: "EGPH:approach"}); definition.aircraft = [{key: "traffic", initial: true, seed: seedFromAircraft(a)}];
  const saved = scenarioSchema.parse(JSON.parse(JSON.stringify(definition)));
  assert.equal(saved.aircraft[0].seed.followRouteAltitudes, true);
  assert.equal(createScenarioExercise(saved, "test", randomUUID()).exercise.aircraft[0].followRouteAltitudes, true);
  let next = engine.advance(state, 1); assert.ok(next.aircraft[0].altitude > 5000);
  next = engine.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(next))));
  next.aircraft[0].radar!.routeIndex = 1; const before = next.aircraft[0].altitude;
  next = engine.advance(next, 1); assert.ok(next.aircraft[0].altitude < before);
});

test("legacy routes hold altitude, heading guidance ignores the profile, and controller altitude takes priority", () => {
  for (const mode of ["legacy", "heading"] as const) {
    const {engine, state, a} = profile(); if (mode === "legacy") delete a.followRouteAltitudes; else a.radar!.navigation = "heading";
    assert.equal(engine.advance(state, 1).aircraft[0].altitude, 5000);
  }
  for (const command of [{type: "vector", altitude: {unit: "feet", value: 4000}}, {type: "route", index: 0, altitude: {unit: "feet", value: 4000}}] as Instruction[]) {
    const {engine, state, a} = profile();
    const result = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: a.id, command}});
    assert.equal(result.error, undefined); assert.equal(result.state.aircraft[0].followRouteAltitudes, undefined);
    const next = engine.advance(result.state, 1); assert.ok(next.aircraft[0].altitude < 5000); assert.equal(next.aircraft[0].radar!.targetAltitude?.value, 4000);
  }
});

test("procedure fixes stay one group: the join keeps its first owner, repeats get their own key, and the schema keeps the tag", () => {
  const star = tagProcedure([{name: "ROXOG", x: 0, y: 0}, {name: "BIGNO", x: 1, y: 0}], {type: "STAR", name: "ROXOG1A"}, "ROXOG", "star");
  const approach = tagProcedure([{name: "BIGNO", x: 1, y: 0}, {name: "FI27R", x: 2, y: 0}], {type: "Approach", name: "ILS 27R"}, "BIGNO", "ils");
  assert.equal(star[0].procedure!.transition, "ROXOG");
  assert.equal(tagProcedure(star, {type: "STAR", name: "ROXOG1A"}, "roxog1a")[0].procedure!.transition, undefined, "a transition named like the procedure adds nothing");
  const plan = appendFlightPlan([{name: "KOBUS", x: -1, y: 0}, ...star], approach);
  assert.deepEqual(flightPlanItems(plan).map(item => [item.start, item.end, item.procedure?.key]), [[0, 0, undefined], [1, 2, "star"], [3, 3, "ils"]]);
  assert.deepEqual(appendedFixes(plan.slice(0, 3), approach).map(p => p.name), ["FI27R"]);
  assert.deepEqual(appendedFixes(Array.from({length: 200}, (_, x) => ({x, y: 0})), approach), []);
  const again = appendFlightPlan(plan, tagProcedure(star, {type: "STAR", name: "ROXOG1A"}, "ROXOG", "again"));
  assert.equal(flightPlanItems(again).length, 4);
  const aircraft = engineFor({trainingStation: "EGPH:approach"}).initialExercise().aircraft[0];
  assert.deepEqual(aircraftSchema.parse({...aircraft, flightPlan: plan}).flightPlan[1].procedure, {key: "star", type: "STAR", name: "ROXOG1A", transition: "ROXOG"});
});

test("moving a fix or a procedure moves only that item and never splits a procedure", () => {
  const group = tagProcedure([{name: "P1", x: 1, y: 0}, {name: "P2", x: 2, y: 0}, {name: "P3", x: 3, y: 0}], {type: "STAR", name: "PROC"}, undefined, "g");
  const plan = [{name: "A", x: 0, y: 0}, ...group, {name: "B", x: 4, y: 0}, {name: "C", x: 5, y: 0}];
  const names = (points: typeof plan) => points.map(p => p.name).join(" ");
  assert.equal(names(moveFlightPlanRange(plan, 0, 0, 5)), "P1 P2 P3 B A C", "a dragged fix moves alone");
  assert.equal(names(moveFlightPlanRange(plan, 1, 3, 6)), "A B C P1 P2 P3", "a dragged procedure moves whole");
  assert.equal(names(moveFlightPlanRange(plan, 4, 4, 0)), "B A P1 P2 P3 C");
  for (const slot of [1, 2, 3, 4]) assert.equal(moveFlightPlanRange(plan, 1, 3, slot), plan, "dropping a procedure onto itself changes nothing");
  assert.equal(names(moveFlightPlanItem(plan, 0, 1)), "P1 P2 P3 A B C", "keyboard moves step over a whole procedure");
  assert.equal(names(moveFlightPlanItem(plan, 4, -1)), "A B P1 P2 P3 C");
  assert.equal(names(moveFlightPlanItem(plan, 1, -1)), "P1 P2 P3 A B C");
  assert.equal(moveFlightPlanItem(plan, 0, -1), plan);
  assert.ok(flightPlanItems(moveFlightPlanItem(plan, 1, 1)).some(item => item.procedure && item.end - item.start === 2));
});


test("scenario takeoff retains its plan and flies the first leg and altitude after the runway climb", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:approach"}, airport = getAirport(selection), engine = engineFor(selection);
  const airborne = engine.newAircraft("planned", true);
  airborne.flightPlan = [{name: "FIRST", x: 20, y: 30, altitude: 5000}, {name: "SECOND", x: 30, y: 40, altitude: 7000}];
  const origin: DepartureAirport = {icao: "TEST", name: "Nearby", elevation: 250, runways: [{id: "09", threshold: {x: 8, y: 0}, departure: {x: 9, y: 0}}]};
  airborne.position = {x: 8, y: 0}; airborne.heading = 90;
  const takeoff = scenarioTakeoffAircraft(airborne, airport, [origin], {airport: airport.icao, airports: [{id: "1", identifier: "TEST", point: {x: 8, y: 0}, isTowered: false, elevationFeet: 250}]});
  assert.deepEqual(takeoff.flightPlan, airborne.flightPlan);
  const definition = blankScenario(selection); definition.aircraft = [{key: "planned", initial: true, seed: seedFromAircraft(takeoff)}];
  let state = createScenarioExercise(scenarioSchema.parse(JSON.parse(JSON.stringify(definition))), "test").exercise; state.running = true;
  for (let i = 0; i < 300; i++) state = engine.advance(state, 1);
  const flown = state.aircraft[0];
  assert.equal(flown.radar!.navigation, "route"); assert.equal(flown.radar!.routeIndex, 0);
  assert.equal(flown.radar!.targetAltitude?.value, 5000); assert.ok(Math.abs(flown.altitude - 5000) < 1);
  assert.ok(flown.targetHeading < 90 && flown.targetHeading > 0);
  assert.deepEqual(flown.flightPlan, airborne.flightPlan);
});
