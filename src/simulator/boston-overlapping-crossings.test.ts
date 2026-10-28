import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {crossingHold} from "./command-ground";
import {engineFor} from "./engine";
import {moveGround} from "./ground-movement";
import {buildGroundRoute, groundRouteError, groundRouteJoin} from "./ground-route";
import {standPlacement} from "./scenarios";
import {exerciseSchema} from "./protocol";
import {routeToNodes, type TaxiGraph} from "./taxi-routing";

test("overlapping runway protections require both crossing clearances at the shared boundary", () => {
  const airport = getAirport({airport: "KBOS"});
  const graph: TaxiGraph = {points: [{x: 0, y: 0}, {x: .1, y: 0}, {x: .2, y: 0}, {x: .3, y: 0}],
    edges: [[{to: 1, distance: .1}], [{to: 0, distance: .1}, {to: 2, distance: .1, protectedBy: ["14/32", "04L/22R"]}],
      [{to: 1, distance: .1, protectedBy: ["14/32", "04L/22R"]}, {to: 3, distance: .1}], [{to: 2, distance: .1}]], holds: [1, 2]};
  const result = routeToNodes(graph, {x: 0, y: 0}, [3], false, [], undefined, airport);
  assert.ok(result.path);
  const holds = result.path.filter(p => p.hold);
  assert.deepEqual(holds.map(p => p.runway), ["14", "04L"]);
  assert.deepEqual({x: holds[0].x, y: holds[0].y}, {x: holds[1].x, y: holds[1].y});
  const engine = engineFor({airport: "KBOS"}), exercise = engine.initialExercise();
  const a = exercise.aircraft[0];
  a.taxiPath = result.path; a.taxiIndex = result.path.indexOf(holds[0]); a.position = {x: holds[0].x, y: holds[0].y};
  a.mode = "taxi"; a.holding = true; a.speed = 0; a.targetSpeed = 15;
  assert.ok(exerciseSchema.safeParse(JSON.parse(JSON.stringify(exercise))).success);
  assert.equal(crossingHold(airport, a, "14").index, a.taxiIndex);
  assert.ok(crossingHold(airport, a, "04L").error);
  a.releasedHold = a.taxiIndex; a.holding = false;
  const guidance = {speedLimit: Infinity, travelLimit: Infinity};
  const first = moveGround(a, a.taxiPath, a.taxiIndex, 1, false, guidance);
  assert.equal(first.index, a.taxiIndex + 1);
  a.taxiIndex = first.index; a.releasedHold = null;
  const second = moveGround(a, a.taxiPath, a.taxiIndex, 1, false, guidance);
  assert.equal(second.index, a.taxiIndex); assert.equal(second.held, true);
  assert.equal(crossingHold(airport, a, "04L").index, a.taxiIndex);
});

test("staggered runway boundaries are cleared before entering either protected area", () => {
  const airport = getAirport({airport: "KBOS"});
  const graph: TaxiGraph = {points: [{x: 0, y: 0}, {x: .1, y: 0}, {x: .2, y: 0}, {x: .3, y: 0}, {x: .4, y: 0}], edges: [
    [{to: 1, distance: .1}], [{to: 0, distance: .1}, {to: 2, distance: .1, protectedBy: ["14/32"]}],
    [{to: 1, distance: .1, protectedBy: ["14/32"]}, {to: 3, distance: .1, protectedBy: ["14/32", "04L/22R"]}],
    [{to: 2, distance: .1, protectedBy: ["14/32", "04L/22R"]}, {to: 4, distance: .1}], [{to: 3, distance: .1}]], holds: [1, 2, 3]};
  const route = routeToNodes(graph, graph.points[0], [4], false, [], undefined, airport);
  assert.ok(route.path);
  const holds = route.path.filter(p => p.hold);
  assert.deepEqual(holds.map(p => [p.x, p.runway]), [[.1, "14"], [.1, "04L"]]);
  assert.ok(routeToNodes(graph, {x: .15, y: 0}, [4], false, [], undefined, airport).error);
  assert.ok(routeToNodes(graph, graph.points[0], [2], false, [], undefined, airport).error);
  const boundary = routeToNodes(graph, graph.points[1], [4], false, [], undefined, airport);
  assert.ok(boundary.path);
  assert.deepEqual(boundary.path.filter(p => p.hold).map(p => [p.x, p.runway]), [[.1, "14"], [.1, "04L"]]);
  assert.equal(boundary.path[0].hold, undefined);
  const aircraft = engineFor({airport: "KBOS"}).newAircraft("boundary", false);
  aircraft.position = graph.points[1];
  assert.equal(groundRouteJoin(aircraft, {airport: "KBOS", kind: "taxi", controls: [graph.points[1], graph.points[4]], destination: {type: "point"}, points: boundary.path, controlIndices: [0, boundary.path.length - 1]}), 1);
});

test("engine radio readbacks release overlapping runway holds one at a time", () => {
  const engine = engineFor({airport: "KBOS"}), position = {x: -.1, y: .1};
  const a = engine.newAircraft("crossing", false);
  Object.assign(a, {position, frequency: "ground", mode: "taxi", holding: true, speed: 0, targetSpeed: 0,
    taxiPath: [{...position}, {...position, hold: true, runway: "14"}, {...position, hold: true, runway: "04L"}, {x: 0, y: .1}], taxiIndex: 1});
  let state = {...engine.initialExercise(), aircraft: [a], running: true, autoReadback: true};
  const send = (runway: string, id: string) => engine.applyEnvelope(state, {id, time: 0, action: {kind: "command", aircraftId: a.id, frequency: "ground", command: {type: "cross", runway}, text: `Cross runway ${runway}`}});
  const first = send("14", "first"); assert.equal(first.error, undefined); state = first.state;
  assert.equal(state.aircraft[0].holding, true, "sending the clearance alone does not release the hold");
  state = engine.autoReadbacks(engine.advance(state, 2), 2000, () => "reply-first");
  for (let i = 0; i < 10 && !(state.aircraft[0].holding && state.aircraft[0].taxiIndex === 2); i++) state = engine.advance(state, 1);
  assert.equal(state.aircraft[0].taxiIndex, 2); assert.equal(state.aircraft[0].holding, true);
  assert.deepEqual(state.aircraft[0].position, position, "the first clearance cannot move past the second hold");
  const second = send("04L", "second"); assert.equal(second.error, undefined); state = second.state;
  assert.equal(state.aircraft[0].holding, true);
  state = engine.autoReadbacks(engine.advance(state, 2), 4000, () => "reply-second");
  for (let i = 0; i < 30 && state.aircraft[0].position.x === position.x; i++) state = engine.advance(state, 1);
  assert.ok(state.aircraft[0].position.x > position.x, "movement resumes after the second readback");
});

test("mapped Boston route cannot remove either required runway crossing hold", () => {
  const airport = getAirport({airport: "KBOS"}), start = standPlacement("784930708", false, airport)!.position;
  const built = buildGroundRoute(airport, "taxi", [start, {x: .0707159407895, y: .513915281074635}], {type: "runway", id: "33R"});
  assert.ok(built.route); assert.equal(built.error, undefined);
  assert.equal(groundRouteError(airport, built.route, "taxi"), null);
  const indices = built.route.points.flatMap((p, i) => p.hold ? [i] : []);
  assert.deepEqual(indices.map(i => built.route!.points[i].runway), ["04L", "15R"]);
  for (const index of indices) {
    const changed = structuredClone(built.route); delete changed.points[index].hold;
    assert.ok(groundRouteError(airport, changed, "taxi"), `missing ${changed.points[index].runway} hold must be rejected`);
  }
});
