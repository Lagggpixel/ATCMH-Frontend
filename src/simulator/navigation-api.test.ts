import assert from "node:assert/strict";
import test from "node:test";
import {createNavigationApi, type NavigationSource} from "./server/navigation-api";
import {SessionError} from "./sessions";
import {getAirport} from "./airports";
import {engineFor} from "./engine";
import {exerciseSchema} from "./protocol";
const origin = getAirport().origin;
const source: NavigationSource = {version: 1, icao: "EGPH", revision: "revision-a", waypoints: [{id: "fix-1", identifier: "TEST", lat: origin.lat + 1 / 60, lon: origin.lon}],
  procedures: [{id: "star-1", identifier: "TEST1A", type: "STAR", routes: [{id: "route-1", transition: "TEST", points: [{identifier: "TEST", lat: origin.lat + 1 / 60, lon: origin.lon}, {identifier: "FAR", lat: origin.lat + 2.5, lon: origin.lon}]}]}]};
const staff = async () => ({accountId: "mentor", staff: true});
const req = (query = "airport=EGPH") => new Request(`https://simulator.test/api/simulator/navigation?${query}`);
test("navigation authenticates before requesting upstream and rejects invalid airports", async () => {
  let reads = 0; const load = async () => {reads++; return source;};
  const denied = createNavigationApi(load, async () => {throw new SessionError("forbidden", "Not permitted", 403);});
  assert.equal((await denied(req())).status, 403); assert.equal(reads, 0);
  assert.equal((await createNavigationApi(load, staff)(req("airport=INVALID"))).status, 400); assert.equal(reads, 0);
});
test("catalogue exposes only local coordinates, labels, revision and route summaries", async () => {
  const response = await createNavigationApi(async () => source, staff)(req()), body = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.ok(Math.abs(body.fixes[0].point.y - 1) < 1e-8); assert.equal(body.fixes[0].point.x, 0);
  assert.equal(body.fixes[0].point.name, "TEST"); assert.equal(body.procedures[0].routes[0].pointCount, 2);
  assert.equal(body.procedures[0].routes[0].points, undefined); assert.doesNotMatch(JSON.stringify(body), /"lat"|"lon"|api.key|headers/i);
});
test("selected routes retain complete geometry beyond display radius and survive saved exercises", async () => {
  const api = createNavigationApi(async () => source, staff);
  assert.equal((await api(req("airport=EGPH&route=route-1&revision=old"))).status, 409);
  const response = await api(req("airport=EGPH&route=route-1&revision=revision-a")), route = await response.json();
  assert.equal(response.status, 200); assert.equal(route.points.length, 2); assert.equal(route.points[1].y, 150);
  const exercise = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  exercise.aircraft[0].flightPlan = route.points; exercise.aircraft[0].navigationSource = {revision: route.revision, procedureId: route.procedureId, routeId: route.routeId};
  assert.deepEqual(exerciseSchema.parse(JSON.parse(JSON.stringify(exercise))).aircraft[0].flightPlan, route.points);
});
test("oversized complete procedures are rejected rather than truncated", async () => {
  const large = structuredClone(source); large.procedures[0].routes[0].points = Array.from({length: 201}, () => source.procedures[0].routes[0].points[0]);
  const response = await createNavigationApi(async () => large, staff)(req("airport=EGPH&route=route-1&revision=revision-a"));
  assert.equal(response.status, 422);
});

test("learners can display complete procedure overlays while aircraft route imports stay staff-only", async () => {
  const large = structuredClone(source); large.procedures[0].routes[0].points = Array.from({length: 201}, () => source.procedures[0].routes[0].points[0]);
  const required: boolean[] = [];
  const api = createNavigationApi(async () => large, async (_request, staff) => {required.push(staff); if (staff) throw new SessionError("forbidden", "Staff only", 403); return {accountId: "learner", staff: false};});
  const response = await api(req("airport=EGPH&overlay=route-1&revision=revision-a"));
  assert.equal(response.status, 200); assert.equal((await response.json()).points.length, 201);
  assert.equal((await api(req("airport=EGPH&route=route-1&revision=revision-a"))).status, 403);
  assert.deepEqual(required, [false, true]);
});

test("approach catalogue and import preserve the full named geometry without issuing a clearance", async () => {
  const approaches = structuredClone(source); approaches.procedures[0].type = "Approach";
  const api = createNavigationApi(async () => approaches, staff);
  const catalogue = await (await api(req())).json(); assert.equal(catalogue.procedures[0].type, "Approach");
  const response = await api(req("airport=EGPH&route=route-1&revision=revision-a"));
  assert.equal(response.status, 200); const route = await response.json(); assert.equal(route.type, "Approach");
  assert.deepEqual(route.points.map((p: {name: string}) => p.name), ["TEST", "FAR"]);
  assert.equal(route.cleared, undefined); assert.equal(route.expected, undefined);
});

test("learners can load radar fixes but cannot import procedure routes", async () => {
  let reads = 0;
  const api = createNavigationApi(async () => {reads++; return source;}, async (_request, staffOnly) => {
    if (staffOnly) throw new SessionError("forbidden", "Not permitted", 403);
    return {accountId: "learner", staff: false, learnerSession: "session-id"};
  });
  const response = await api(req());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).fixes[0].name, "TEST");
  assert.equal((await api(req("airport=EGPH&route=route-1&revision=revision-a"))).status, 403);
  assert.equal(reads, 1);
});

test("radar catalogue retains every provider fix beyond the old manual and picker limits", async () => {
  const many = {...source, waypoints: Array.from({length: 1001}, (_, i) => ({...source.waypoints[0], id: `fix-${i}`, identifier: `FIX${i}`}))};
  const response = await createNavigationApi(async () => many, staff)(req());
  const body = await response.json();
  assert.equal(body.fixes.length, 1001);
  assert.equal(body.fixes.at(-1).name, "FIX1000");
  assert.deepEqual(engineFor({trainingStation: "EGPH:approach"}).initialExercise().radarEnvironment?.fixes, []);
});

test("navaid type and TACAN subtype survive catalogue projection, route import and saved snapshots", async () => {
  const typed = structuredClone(source);
  Object.assign(typed.waypoints[0], {waypointType: "VOR", vorType: "TACAN", slavedVariation: 0});
  Object.assign(typed.procedures[0].routes[0].points[0], {waypointType: "NDB"});
  Object.assign(typed.procedures[0].routes[0].points[1], {waypointType: "VOR", vorType: "VORTAC", slavedVariation: 14.2});
  const api = createNavigationApi(async () => typed, staff);
  const catalogue = await (await api(req())).json();
  assert.equal(catalogue.fixes[0].point.waypointType, "VOR");
  assert.equal(catalogue.fixes[0].point.vorType, "TACAN");
  assert.equal(catalogue.fixes[0].point.slavedVariation, 0);
  const route = await (await api(req("airport=EGPH&route=route-1&revision=revision-a"))).json();
  const exercise = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  exercise.aircraft[0].flightPlan = route.points;
  const saved = exerciseSchema.parse(JSON.parse(JSON.stringify(exercise))).aircraft[0].flightPlan;
  assert.equal(saved[0].waypointType, "NDB");
  assert.equal(saved[1].waypointType, "VOR");
  assert.equal(saved[1].vorType, "VORTAC");
  assert.equal(saved[1].slavedVariation, 14.2);
  exercise.radarEnvironment!.fixes = [{id: "VOR", point: {x: 0, y: 0}, waypointType: "VOR", slavedVariation: 0}];
  assert.equal(exerciseSchema.parse(exercise).radarEnvironment!.fixes[0].slavedVariation, 0);
});


test("simplified STAR status reaches catalogue, route and saved procedure metadata", async () => {
  const simplified = structuredClone(source); simplified.procedures[0].routes[0].simplified = true;
  const api = createNavigationApi(async () => simplified, staff);
  const catalogue = await (await api(req())).json();
  assert.equal(catalogue.procedures[0].routes[0].simplified, true);
  const route = await (await api(req("airport=EGPH&route=route-1&revision=revision-a"))).json();
  assert.equal(route.simplified, true);
  const {tagProcedure} = await import("./scenario-flight-plan");
  const exercise = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  exercise.aircraft[0].flightPlan = tagProcedure(route.points, route, "TEST", "star");
  assert.equal(exerciseSchema.parse(JSON.parse(JSON.stringify(exercise))).aircraft[0].flightPlan[0].procedure?.simplified, true);
});
