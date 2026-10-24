import assert from "node:assert/strict";
import test from "node:test";
import {AIRPORT, advance, applyEnvelope, autoReadbacks, initialExercise, restoreExercise, validateAssignment} from "./engine";
import {buildGroundRoute, groundRouteError, groundRouteJoin, groundRouteKind, hitGroundRoute, planPointRoute} from "./ground-route";
import {catalogFor} from "./catalog";
import {exerciseSchema, groundRouteSchema, menteeActionAllowed} from "./protocol";
import {prepareQuickCommand} from "./quick-commands";
import {moveGround} from "./ground-movement";
import type {Airport, Instruction} from "./model";

const square: Airport = {...AIRPORT, features: [
  {id: "a", kind: "taxiway", name: "A", points: [{x: 10, y: 10}, {x: 11, y: 10}]},
  {id: "b", kind: "taxiway", name: "B", points: [{x: 10, y: 10}, {x: 10, y: 11}, {x: 11, y: 11}, {x: 11, y: 10}]},
  {id: "island", kind: "taxiway", name: "C", points: [{x: 12, y: 12}, {x: 13, y: 12}]},
]};
function departure() {
  const state = initialExercise(), a = state.aircraft[1]; state.running = true; state.autoReadback = true; a.holding = true;
  const {route, error} = buildGroundRoute(AIRPORT, "taxi", [a.position, {x: 0, y: 0}], {type: "runway", id: "24"});
  assert.equal(error, undefined); return {state, a, route: route!};
}

test("a dragged destination on the same edge travels directly; a via forces a connected detour", () => {
  const direct = planPointRoute(square, {x: 10.1, y: 10}, {x: 10.9, y: 10});
  assert.equal(direct.error, undefined); assert.ok(Math.abs(direct.distance! - .8) < 1e-7);
  const detour = buildGroundRoute(square, "taxi", [{x: 10.1, y: 10}, {x: 10, y: 11}, {x: 10.9, y: 10}]);
  assert.equal(detour.error, undefined); assert.ok(detour.route!.points.some(p => p.y === 11));
  assert.equal(detour.route!.controlIndices.length, 3);
  assert.match(groundRouteError(square, {...detour.route!, points: detour.route!.points.map((p, i) => i === 1 ? {...p, x: p.x + .1} : p)}, "taxi")!, /mapped route changed/);
  assert.match(planPointRoute(square, {x: 10, y: 10}, {x: 12.5, y: 12}).error!, /No connected/);
  assert.match(planPointRoute(square, {x: 10, y: 10}, {x: 50, y: 50}).error!, /No compatible/);
});

test("reviewed route, names and Hold choices survive send, readback, assignment and restore", () => {
  const fixture = departure(), {a, route} = fixture;
  let state = fixture.state;
  route.points.at(-1)!.hold = false;
  const command: Instruction = {type: "taxi", runway: "24", route, contactTowerWhenReady: true};
  const action = {kind: "command" as const, aircraftId: a.id, frequency: "ground" as const, command, text: catalogFor(AIRPORT).instructionText(a, command)};
  const previous = structuredClone(a.taxiPath);
  assert.equal(menteeActionAllowed(action, state), true);
  assert.equal(prepareQuickCommand(action, state), null, "a per-aircraft route never becomes a reusable shortcut");
  const sent = applyEnvelope(state, {id: "taxi", time: 1, action});
  assert.equal(sent.error, undefined); state = sent.state;
  assert.deepEqual(state.aircraft[1].taxiPath, previous, "sending alone does not move or assign");
  assert.match(state.messages.at(-1)!.text, /taxi to runway 24 via/);
  state = autoReadbacks(advance(state, 1.5), 2, () => "reply");
  assert.deepEqual(state.aircraft[1].taxiPath, route.points);
  assert.match(state.messages.at(-1)!.text, /Taxiing to runway 24 via/);
  assert.equal(state.aircraft[1].contactTowerAtHold, true);
  const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))))!;
  assert.deepEqual(restored.aircraft[1].taxiPath, route.points);
  assert.deepEqual(restored.messages.find(m => m.id === "taxi")!.instruction, command);
});

test("manual delayed assignment rejects a route that no longer reaches the aircraft without teleporting", () => {
  const {a, route} = departure();
  assert.notEqual(groundRouteJoin(a, route), undefined);
  a.position = {x: 100, y: 100};
  const position = {...a.position};
  assert.match(validateAssignment(a, {type: "taxi", route}, "ground")!, /moved away/);
  assert.deepEqual(a.position, position);
});

test("sending snapshots the route and rejects conflicting runway/frequency selections", () => {
  const {state, a, route} = departure();
  const command: Instruction = {type: "taxi", runway: "24", route};
  const send = (instruction: Instruction, frequency: "ground" | "tower" = "ground") => applyEnvelope(state, {id: "reviewed", time: 1, action: {kind: "command", aircraftId: a.id, command: instruction, frequency, text: catalogFor(AIRPORT).instructionText(a, instruction)}});
  assert.match(send({...command, runway: "06"}).error!, /destination must match/);
  const sent = send(command); assert.equal(sent.error, undefined);
  const savedPoint = {...route.points[1]}; route.points[1].x += 1;
  const saved = sent.state.messages.at(-1)!.instruction;
  assert.ok(saved?.type === "taxi"); assert.deepEqual(saved.route!.points[1], savedPoint);
  a.frequency = "tower";
  assert.match(send({...command, route: {...route, points: sent.state.aircraft[1].taxiPath}}, "tower").error!, /Ground frequency/);
  assert.equal(menteeActionAllowed({kind: "edit", aircraftId: a.id, patch: {enginesRunning: false}}, state), false);
});

test("route schema and server validation reject forged airport, geometry and route names", () => {
  const {route} = departure();
  assert.equal(groundRouteSchema.safeParse(route).success, true);
  assert.equal(groundRouteSchema.safeParse({...route, controls: Array(25).fill({x: 0, y: 0})}).success, false);
  assert.match(groundRouteError(AIRPORT, {...route, airport: "KJFK"}, "taxi")!, /another airport/);
  assert.match(groundRouteError(AIRPORT, {...route, kind: "pushback"}, "taxi")!, /another airport/);
  const forged = structuredClone(route); forged.points[1].name = "invented";
  assert.match(groundRouteError(AIRPORT, forged, "taxi")!, /mapped route changed/);
  const holds = structuredClone(route); holds.points[2].hold = true;
  assert.equal(groundRouteError(AIRPORT, holds, "taxi"), null);
});

test("route hit testing selects controls, inserts vias, and leaves empty map space for panning", () => {
  const route = buildGroundRoute(square, "taxi", [{x: 10.1, y: 10}, {x: 10.9, y: 10}]).route!;
  assert.deepEqual(hitGroundRoute(route, {x: 10.9, y: 10}, .01), {index: 1, insert: false});
  assert.deepEqual(hitGroundRoute(route, {x: 10.5, y: 10}, .01), {index: 1, insert: true});
  assert.equal(hitGroundRoute(route, {x: 10.5, y: 10.5}, .01), undefined);
});

test("simulated engine readiness chooses pushback only while stopped and keeps legacy snapshots usable", () => {
  const {a} = departure();
  Object.assign(a, {mode: "parked", speed: 0, groundReady: false});
  assert.equal(groundRouteKind(a, AIRPORT), "pushback");
  a.enginesRunning = true; assert.equal(groundRouteKind(a, AIRPORT), "taxi");
  a.enginesRunning = false; a.speed = 1; assert.equal(groundRouteKind(a, AIRPORT), "taxi");
  delete a.enginesRunning; a.speed = 0; a.groundReady = true; assert.equal(groundRouteKind(a, AIRPORT), "taxi");
});

test("push/pull has two short legs, stops at the change of direction, then moves forward", () => {
  const {a} = departure();
  Object.assign(a, {mode: "pushback", position: {x: 0, y: 0}, heading: 180, targetHeading: 180, speed: 0, targetSpeed: 3, holding: false});
  a.pushback = {path: [{x: 0, y: 0}, {x: 0, y: .01}, {x: 0, y: -.01}], index: 1, pullFrom: 2};
  let index = 1, reachedPivot = false;
  for (let i = 0; i < 3000 && index < 3; i++) {
    const before = {...a.position};
    index = moveGround(a, a.pushback.path, index, .1, index < 2, {speedLimit: Infinity, travelLimit: Infinity}).index;
    assert.ok(Math.hypot(a.position.x - before.x, a.position.y - before.y) < .0001);
    if (index === 2 && !reachedPivot) {reachedPivot = true; assert.equal(a.speed, 0); assert.ok(Math.abs(a.position.y - .01) < 1e-7);}
  }
  assert.equal(reachedPivot, true); assert.equal(index, 3); assert.ok(Math.abs(a.position.y + .01) < 1e-7);
  assert.match(buildGroundRoute(square, "pushback", [{x: 10, y: 10}, {x: 11, y: 10}]).error!, /300 metres/);
  const tooLong = buildGroundRoute(square, "pushback", [{x: 10, y: 10}, {x: 11, y: 10}]);
  assert.ok(tooLong.route, "invalid push length still exposes editable preview geometry");
  assert.match(groundRouteError(square, tooLong.route, "pushback")!, /300 metres/);
});
