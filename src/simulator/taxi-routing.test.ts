import assert from "node:assert/strict";
import test from "node:test";
import {aStar, buildTaxiGraph, planTaxiRoute, TAXI_ROUTING, type TaxiGraph} from "./taxi-routing";
import {AIRPORT, advance, applyEnvelope, autoReadbacks, engineFor, initialExercise, predictAircraft, readbackText, restoreExercise} from "./engine";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {commandTasks, instructionText} from "./catalog";
import {exerciseSchema} from "./protocol";
import {radioMessageText} from "./radio-audio";
const gap = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(a.x - b.x, a.y - b.y);

test("A* chooses the shortest connected centerline path and rejects disconnected goals", () => {
  const graph: TaxiGraph = {points: [{x: 0, y: 0}, {x: 1, y: 2}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 5, y: 5}], edges: [[{to: 1, distance: 3}, {to: 2, distance: 1}], [{to: 3, distance: 3}], [{to: 3, distance: 1}], [], []], holds: [3]};
  assert.deepEqual(aStar(graph, 0, [3]), [0, 2, 3]); assert.equal(aStar(graph, 0, [4]), null); assert.equal(aStar(graph, 0, []), null);
});
test("EGPH routes reach both runway hold points exclusively over mapped network edges", () => {
  const start = initialExercise().aircraft[1].position, graph = buildTaxiGraph(AIRPORT);
  for (const runway of ["06", "24"] as const) {
    const result = planTaxiRoute(AIRPORT, start, runway); assert.equal(result.error, undefined); const path = result.path!;
    assert.ok(path.length > 2 && path.length <= 200); assert.equal(path.at(-1)!.hold, undefined); assert.equal(path.at(-1)!.runway, runway); assert.ok(result.distance! > .1);
    assert.ok(gap(path.at(-1)!, AIRPORT.runway.ends.find(end => end.id === runway)!.point) <= TAXI_ROUTING.departureAccessRadius);
    for (let i = 2; i < path.length; i++) {
      const from = graph.points.findIndex(p => gap(p, path[i - 1]) < 1e-7), to = graph.points.findIndex(p => gap(p, path[i]) < 1e-7);
      assert.ok(from >= 0 && to >= 0 && graph.edges[from].some(edge => edge.to === to), `off-network segment ${i}`);
    }
    const again = planTaxiRoute(AIRPORT, start, runway); assert.deepEqual(result, again);
  }
});
test("routing refuses off-airport positions and runway shortcuts", () => {
  assert.match(planTaxiRoute(AIRPORT, {x: 10, y: 10}, "24").error!, /No mapped taxiway/);
  assert.match(planTaxiRoute(AIRPORT, {x: 0, y: 0}, "24").error!, /protected area/);
});
test("Santiago routes to a mapped runway-end entry without entering the protected area", () => {
  const airport = getAirport({airport: "SCEL"}), graph = buildTaxiGraph(airport);
  const gate = gatesFor(airport).find(item => item.name === "B01")!;
  const route = planTaxiRoute(airport, standPlacement(gate.id, false, airport)!.position, "17R");
  assert.ok(route.path, route.error);
  const last = route.path.at(-1)!;
  const runway = airport.runways!.find(pair => pair.id === "17R/35L")!;
  assert.ok(gap(last, runway.ends[0].point) < .1);
  assert.equal(last.runway, "17R");
  assert.ok(graph.runwayHolds![runway.id].some(i => gap(graph.points[i], last) < 1e-6));
});
test("taxi-to-runway assignment calculates a route and simulated traffic stops short", () => {
  let state = initialExercise(); const a = state.aircraft[1]; a.taxiPath = [];
  const entry = {instruction: {...commandTasks("ground", a).find(t => t.id === "taxi")!.command, runway: "06" as const, contactTowerWhenReady: false}};
  assert.deepEqual(entry.instruction, {type: "taxi", destination: "runway", runway: "06", contactTowerWhenReady: false});
  state = applyEnvelope(state, {id: "taxi", time: 1, action: {kind: "command", aircraftId: a.id, command: entry.instruction!, frequency: "ground", text: "Taxi to Runway 06"}}).state;
  assert.equal(state.aircraft[1].taxiPath.length, 0);
  const assigned = applyEnvelope(state, {id: "assign", time: 2, action: {kind: "pilot", aircraftId: a.id, text: "Taxiing", replyTo: "taxi", assign: true}});
  assert.equal(assigned.error, undefined); state = assigned.state; state.running = true; state.autoReadback = true;
  for (let i = 0; i < 600; i++) state = advance(state, 1);
  const traffic = state.aircraft[1]; assert.equal(traffic.runway, "06"); assert.equal(traffic.mode, "parked"); assert.equal(traffic.holding, false); assert.equal(traffic.speed, 0);
  assert.equal(traffic.frequency, "ground"); assert.equal(traffic.contactTowerAtHold, undefined);
  assert.ok(gap(traffic.position, traffic.taxiPath.at(-1)!) < 1e-7);
});

test("runway taxi command and automatic readback retain the requested instruction without channel prefixes", () => {
  let state = initialExercise(); state.autoReadback = true; state.running = true;
  const a = state.aircraft[1], command = {type: "taxi", destination: "runway", runway: "24"} as const;
  const text = instructionText(a, command);
  assert.equal(text, "Easy 571, taxi to runway 24, contact tower when ready");
  state = applyEnvelope(state, {id: "taxi", time: 1, action: {kind: "command", aircraftId: a.id, command, frequency: "ground", text}}).state;
  assert.equal(state.aircraft[1].contactTowerAtHold, undefined);
  state = autoReadbacks(advance(state, 1.5), 2, () => "readback");
  const reply = state.messages.at(-1)!;
  assert.equal(reply.text, "Taxi to runway 24, Easy 571");
  assert.equal(reply.text, readbackText(a.callsign, text, command));
  assert.equal(radioMessageText(reply), "Taxi to Runway two four, Easy 571");
  assert.equal(state.aircraft[1].frequency, "ground"); assert.equal(state.aircraft[1].contactTowerAtHold, true);
});

test("menu taxi holds only for intermediate runway crossings and removes the Tower phrase", () => {
  const airport = getAirport({airport: "ROAH"}), engine = engineFor({airport: "ROAH"});
  let state = engine.initialExercise(); const a = {...engine.newAircraft("crossing-menu", false), ...standPlacement(gatesFor(airport)[0].id, false, airport)!};
  state.aircraft = [a]; state.running = true; state.autoReadback = true;
  const sent = engine.applyEnvelope(state, {id: "menu-taxi", time: 1, action: {kind: "command", aircraftId: a.id, frequency: "ground", command: {type: "taxi", runway: "18R", contactTowerWhenReady: true}, text: "Taxi to runway 18R, contact tower when ready"}});
  assert.equal(sent.error, undefined); state = sent.state;
  const message = state.messages.at(-1)!;
  assert.match(message.text, /hold short of runway 18L/); assert.doesNotMatch(message.text, /contact tower/i);
  assert.equal(message.instruction!.type === "taxi" && message.instruction!.contactTowerWhenReady, false);
  state = engine.autoReadbacks(engine.advance(state, 2), 2000, () => "menu-taxi-reply");
  assert.equal(state.aircraft[0].taxiPath.at(-1)!.hold, undefined);
  assert.equal(state.aircraft[0].taxiPath.at(-1)!.runway, "18R");
  assert.deepEqual(state.aircraft[0].taxiPath.filter(p => p.hold).map(p => p.runway), ["18L"]);
  assert.equal(state.aircraft[0].contactTowerAtHold, undefined);
  for (let i = 0; i < 1000 && !state.aircraft[0].holding; i++) state = engine.advance(state, 1);
  assert.equal(state.aircraft[0].holding, true); assert.equal(state.aircraft[0].frequency, "ground");
});

test("ordinary menu taxi without crossings stops at the entry and follows its Tower instruction", () => {
  let state = initialExercise(); state.aircraft = [state.aircraft[1]]; state.running = true; state.autoReadback = true;
  const id = state.aircraft[0].id;
  state = applyEnvelope(state, {id: "menu-handoff", time: 1, action: {kind: "command", aircraftId: id, frequency: "ground", command: {type: "taxi", runway: "24"}, text: "Taxi to runway 24"}}).state;
  assert.match(state.messages.at(-1)!.text, /contact tower when ready/);
  state = autoReadbacks(advance(state, 2), 2000, () => "menu-handoff-reply");
  assert.equal(state.aircraft[0].taxiPath.at(-1)!.hold, undefined);
  for (let i = 0; i < 1000 && state.aircraft[0].frequency === "ground"; i++) state = advance(state, 1);
  assert.equal(state.aircraft[0].frequency, "tower"); assert.equal(state.aircraft[0].speed, 0);
});

test("handover waits for the final hold, survives snapshot recovery, and is never predicted early", () => {
  let state = initialExercise(); const a = state.aircraft[1];
  Object.assign(a, {mode: "taxi", speed: 15, targetSpeed: 15, heading: 90, targetHeading: 90, position: {x: 0, y: 0}, taxiPath: [{x: .01, y: 0, hold: true}], taxiIndex: 0, contactTowerAtHold: true});
  state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))))!;
  assert.equal(advance(state, 5).aircraft[1].frequency, "ground", "paused exercises cannot hand over");
  state.running = true; state.autoReadback = true;
  state = advance(state, .2); assert.equal(state.aircraft[1].frequency, "ground");
  const predicted = predictAircraft(state.aircraft, 1.5)[1];
  assert.equal(predicted.holding, false, "traffic travels continuously instead of snapping early to the hold"); assert.equal(predicted.frequency, "ground");
  const arrived = advance(state, 5).aircraft[1];
  assert.equal(arrived.frequency, "tower"); assert.equal(arrived.holding, true); assert.equal(arrived.speed, 0);
  assert.equal(state.aircraft[1].frequency, "ground", "advance leaves its input unchanged");
});

test("legacy custom holds stay on Ground and instructor route or frequency edits cancel a queued handover", () => {
  const state = initialExercise(); state.running = true; state.autoReadback = true; const a = state.aircraft[1];
  Object.assign(a, {mode: "taxi", taxiPath: [{...a.position, hold: true}, {...a.position, x: a.position.x + .01}], taxiIndex: 0});
  assert.equal(advance(state, 1).aircraft[1].frequency, "ground");
  a.contactTowerAtHold = true;
  for (const patch of [{frequency: "tower" as const}, {taxiPath: [...a.taxiPath]}, {position: {...a.position}}]) {
    const edited = applyEnvelope(state, {id: "edit", time: 1, action: {kind: "edit", aircraftId: a.id, patch}}).state;
    assert.equal(edited.aircraft[1].contactTowerAtHold, undefined);
  }
  const parking = applyEnvelope(state, {id: "parking", time: 1, action: {kind: "maneuver", aircraftId: a.id, command: {type: "taxi", destination: "parking"}}}).state;
  assert.equal(parking.aircraft[1].contactTowerAtHold, undefined);
  assert.equal(advance(parking, 1).aircraft[1].frequency, "ground");
});
