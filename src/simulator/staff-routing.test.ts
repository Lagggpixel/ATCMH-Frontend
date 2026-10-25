import assert from "node:assert/strict";
import test from "node:test";
import {AIRPORT, applyEnvelope, initialExercise, engineFor} from "./engine";
import {buildGroundRoute} from "./ground-route";
import {flightPlanPatch, moveFlightPlanLeg, parseTypedRoute} from "./scenario-flight-plan";
import type {Aircraft, Action, Exercise} from "./model";
import type {NavigationCatalog} from "./navigation-data";
import {randomUUID} from "node:crypto";
import {MemoryStore} from "./session-test-store";
import {SessionService} from "./server/session-service";

test("staff drag-and-taxi applies a reviewed route as the pilot on any frequency", () => {
  const state = initialExercise(), a = state.aircraft[1]; a.holding = true; a.frequency = "tower";
  const {route} = buildGroundRoute(AIRPORT, "taxi", [a.position, AIRPORT.runway.ends.find(end => end.id === "24")!.point], {type: "runway", id: "24"});
  assert.ok(route);
  const result = applyEnvelope(state, {id: "staff-taxi", time: 1, action: {kind: "maneuver", aircraftId: a.id, command: {type: "taxi", runway: "24", destination: "runway", route}}});
  assert.equal(result.error, undefined);
  const moved = result.state.aircraft[1];
  assert.equal(moved.mode, "taxi");
  assert.deepEqual(moved.taxiPath.map(p => [p.x, p.y]), route.points.map(p => [p.x, p.y]));
  assert.equal(moved.contactTowerAtHold, undefined);
  assert.equal(result.state.messages.length, state.messages.length);
});

const catalog: NavigationCatalog = {revision: "r1", airport: "EGPH", fixes: [
  {id: "1", name: "TLA", point: {x: 0, y: 10}}, {id: "2", name: "TLA", point: {x: 300, y: 300}}, {id: "3", name: "GOW", point: {x: 5, y: 12, name: "GOW"}},
], procedures: [{id: "p1", name: "TLA1A", type: "STAR", routes: [{id: "r-gow", name: "GOW", pointCount: 3}, {id: "r-tla", name: "TLA", pointCount: 2}]}]};

test("typed routes resolve fixes and procedure transitions from the navigation catalogue", () => {
  const direct = parseTypedRoute(catalog, "tla dct gow", {x: 0, y: 0});
  assert.equal(direct.error, undefined);
  assert.deepEqual(direct.entries.map(entry => "point" in entry ? [entry.point.name, entry.point.x] : entry.name), [["TLA", 0], ["GOW", 5]]);
  const neighbour = parseTypedRoute(catalog, "GOW TLA1A", {x: 0, y: 0}).entries.at(-1);
  assert.ok(neighbour && "route" in neighbour && neighbour.route.id === "r-gow");
  const explicit = parseTypedRoute(catalog, "TLA1A.TLA", {x: 0, y: 0}).entries[0];
  assert.ok(explicit && "route" in explicit && explicit.route.id === "r-tla");
  assert.match(parseTypedRoute(catalog, "TLA1A.XYZ", {x: 0, y: 0}).error!, /no XYZ transition/);
  assert.match(parseTypedRoute(catalog, "TLA NOPE", {x: 0, y: 0}).error!, /No waypoint or procedure named NOPE/);
  assert.match(parseTypedRoute(catalog, " DCT ", {x: 0, y: 0}).error!, /at least one/);
});

test("reordering keeps a live aircraft heading for the same fix, while seeds restart", () => {
  const plan = [{x: 0, y: 0, name: "A"}, {x: 1, y: 0, name: "B"}, {x: 2, y: 0, name: "C"}];
  assert.deepEqual(moveFlightPlanLeg(plan, 0, 2).map(p => p.name), ["B", "C", "A"]);
  assert.equal(moveFlightPlanLeg(plan, 0, 5), plan);
  const aircraft = {flightPlan: plan, radar: {routeIndex: 1, navigation: "route"}} as unknown as Aircraft;
  assert.equal(flightPlanPatch(aircraft, moveFlightPlanLeg(plan, 1, 2), true).radar!.routeIndex, 2);
  assert.equal(flightPlanPatch(aircraft, plan.filter(p => p.name !== "B"), true).radar!.routeIndex, 1);
  assert.equal(flightPlanPatch(aircraft, moveFlightPlanLeg(plan, 1, 2)).radar!.routeIndex, 0);
  assert.equal(flightPlanPatch(aircraft, [], true).radar!.navigation, "heading");
});

const engine = engineFor({airport: "KDAL"});

const stateOf = (aircraft: Aircraft[]): Exercise => ({...engine.initialExercise(), aircraft, running: true});

test("session service rejects learner bulk/report actions and preserves overlapping Local aircraft", async () => {
  const store = new MemoryStore(); let now = 1000;
  const service = new SessionService(store, () => now), staff = {accountId: "mentor", staff: true}, learner = {accountId: "learner", staff: false, learnerSession:""};
  const created = await service.create(staff, "Synthetic controls", stateOf([engine.newAircraft("a", true)]));
  learner.learnerSession=created.id;
  await service.join(staff, created.id, "staff", "staff-seat"); await service.join(learner, created.id, "mentee", "learner-seat");
  for (const action of [{kind: "all-full-stop"}, {kind: "report-position", aircraftId: "a"}] as Action[]) {
    await assert.rejects(service.dispatch(learner, created.id, "mentee", "learner-seat", {id: randomUUID(), time: now, action}), /unavailable/);
    await service.dispatch(staff, created.id, "staff", "staff-seat", {id: randomUUID(), time: now, action});
  }
  const record = store.records.get(created.id)!;
  assert.equal(record.exercise.aircraft[0].landing, "full-stop"); assert.equal(record.exercise.messages.length, 1);
  record.exercise.aircraft = ["a", "b"].map((id, i) => ({...engine.newAircraft(id, false), mode: "pushback", position: {x: i * .03, y: 0}, heading: i ? 90 : 270, targetHeading: i ? 90 : 270, speed: 3, targetSpeed: 3, pushback: {path: [{x: i ? -.1 : .1, y: 0}, {x: i ? -.2 : .2, y: 0}], index: 0}}));
  const before = record.contentRevision;
  for (let t = 0; t < 30 && store.records.get(created.id)!.exercise.aircraft.some(a=>a.active); t++) {now += 1000; await service.join(staff, created.id, "staff", "staff-seat");await service.frame(staff, created.id, "staff", "staff-seat");}
  await service.join(learner, created.id, "mentee", "learner-seat");
  const frame = await service.frame(learner, created.id, "mentee", "learner-seat");
  assert.equal(frame.exercise.aircraft.length, 2); assert.equal(frame.exercise.collisions?.length ?? 0, 0);
  assert.equal(frame.contentRevision, before, "Local overlap must not invent a crash content update");
});
