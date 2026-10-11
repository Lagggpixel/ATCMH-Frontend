import assert from "node:assert/strict";
import test from "node:test";
import {advance, AIRPORT, applyEnvelope, distance, initialExercise, newAircraft, predictAircraft, validateAssignment} from "./engine";
import {GROUND, planPushback} from "./ground-movement";
import {standPlacement} from "./scenarios";
import {exerciseSchema} from "./protocol";
import {pilotRequests, pilotRequestText, resolvePilotRequest} from "./catalog";
import type {Aircraft, Exercise} from "./model";

const taxi = (id: string, x: number, y = 0): Aircraft => ({...newAircraft(id, false), position: {x, y}, heading: 90, targetHeading: 90, mode: "taxi", speed: 15, targetSpeed: 15, taxiPath: [{x: 1, y: 0}], taxiIndex: 0});
const exercise = (aircraft: Aircraft[]): Exercise => ({...initialExercise(), aircraft, running: true});
const turn = (a: number, b: number) => Math.abs((b - a + 540) % 360 - 180);

test("taxi traffic stops with an 83m gap and resumes when the route clears, on either frequency", () => {
  const leader = {...taxi("leader", .12), mode: "parked" as const, speed: 0, targetSpeed: 0, frequency: "tower" as const};
  let state = exercise([taxi("follower", 0), leader]);
  for (let i = 0; i < 1200; i++) {
    state = advance(state, .05);
    assert.ok(distance(state.aircraft[0].position, leader.position) >= GROUND.spacing - 1e-7);
  }
  assert.ok(state.aircraft[0].speed < .01);
  assert.equal(state.aircraft[0].holding, false, "traffic spacing must not consume a controller hold");
  const stopped = state.aircraft[0].position.x;
  state.aircraft[1].position = {x: .12, y: .1};
  state = advance(state, 5);
  assert.ok(state.aircraft[0].speed > 0); assert.ok(state.aircraft[0].position.x > stopped);
});

test("moving queues retain spacing independent of roster order and prediction agrees", () => {
  const traffic = [taxi("rear", 0), {...taxi("front", .08), targetSpeed: 5}];
  let forward = exercise(traffic), reverse = exercise(structuredClone(traffic).reverse());
  for (let i = 0; i < 400; i++) {
    const predicted = predictAircraft(forward.aircraft, .05);
    forward = advance(forward, .05); reverse = advance(reverse, .05);
    assert.deepEqual(predicted.map(a => a.position), forward.aircraft.map(a => a.position));
    assert.deepEqual(forward.aircraft.map(a => a.position), reverse.aircraft.toReversed().map(a => a.position));
    assert.ok(distance(forward.aircraft[0].position, forward.aircraft[1].position) >= GROUND.spacing - 1e-7);
  }
});

test("continuous taxi turns never snap to corners and finish at the hold point", () => {
  const a = taxi("turns", 0); a.taxiPath = [{x: .06, y: 0}, {x: .06, y: .06}, {x: .12, y: .06, hold: true}];
  let state = exercise([a]), turningFrames = 0;
  for (let i = 0; i < 3000 && !state.aircraft[0].holding; i++) {
    const previous = state.aircraft[0]; state = advance(state, .05); const current = state.aircraft[0];
    assert.ok(distance(previous.position, current.position) <= 15 / 3600 * .05 + 1e-7, "no jump larger than the frame's taxi distance");
    assert.ok(turn(previous.heading, current.heading) <= GROUND.turnRate * .05 + 1e-7);
    if (turn(previous.heading, current.heading) > .1) turningFrames++;
  }
  assert.ok(turningFrames > 60); assert.equal(state.aircraft[0].holding, true);
  assert.deepEqual(state.aircraft[0].position, {x: .12, y: .06});
});

test("traffic around a taxi bend is respected without stopping aircraft on a parallel taxiway", () => {
  const follower = taxi("follower", 0); follower.taxiPath = [{x: .04, y: 0}, {x: .04, y: .1}];
  const obstacle = {...taxi("obstacle", .04, .015), mode: "parked" as const, speed: 0};
  let state = exercise([follower, obstacle]);
  for (let i = 0; i < 800; i++) state = advance(state, .05);
  assert.ok(state.aircraft[0].position.x < .02); assert.equal(state.aircraft[0].speed, 0);
  const parallel = {...obstacle, position: {x: .03, y: .08}};
  state = advance(exercise([taxi("follower", 0), parallel]), 5);
  assert.equal(state.aircraft[0].speed, 15);
});

test("pushback uses a mapped taxiway behind a real stand and ends on its centerline", () => {
  const stand = AIRPORT.features.find(f => f.kind === "parking_position")!;
  const a = {...newAircraft("stand", false), ...standPlacement(stand.id)!};
  const plan = planPushback(AIRPORT, a, "north"); assert.ok(plan.path, plan.error);
  const rear = {x: -Math.sin(a.heading * Math.PI / 180), y: -Math.cos(a.heading * Math.PI / 180)};
  assert.ok((plan.path[0].x - a.position.x) * rear.x + (plan.path[0].y - a.position.y) * rear.y > 0);
  let state = applyEnvelope(exercise([a]), {id: "push", time: 1, action: {kind: "maneuver", aircraftId: a.id, command: {type: "pushback", tail: "north"}}}).state;
  assert.equal(state.aircraft[0].mode, "pushback");
  for (let i = 0; i < 10000 && state.aircraft[0].mode === "pushback"; i++) {
    const previous = state.aircraft[0], oldIndex = previous.pushback?.index;
    const predicted = predictAircraft(state.aircraft, .05);
    assert.equal(previous.pushback?.index, oldIndex, "prediction cannot mutate the authoritative path cursor");
    state = advance(state, .05);
    assert.deepEqual(predicted[0].position, state.aircraft[0].position);
    assert.ok(distance(previous.position, state.aircraft[0].position) <= 3 / 3600 * .05 + 1e-7);
  }
  assert.equal(state.aircraft[0].mode, "parked"); assert.deepEqual(state.aircraft[0].position, plan.path.at(-1));
  assert.equal(exerciseSchema.safeParse(state).success, true);
  assert.match(validateAssignment({...a, position: {x: 50, y: 50}}, {type: "pushback", tail: "north"})!, /No mapped taxiway behind/);
});

test("ground requests remain phase-specific, keep legacy revisions readable, and optionally state pattern intentions", () => {
  const a = {...newAircraft("pilot", false), frequency: "tower" as const};
  const requests = pilotRequests(a);
  assert.deepEqual(requests.map(r => r.label), ["Request runway crossing", "Frequency Change", "Request Takeoff", "Request Runway Change"]);
  assert.ok(!requests.some(r => r.id === "pattern-entry"));
  assert.equal(resolvePilotRequest({label: "Request pattern entry"})?.id, "pattern-entry");
  const departure = requests.find(r => r.id === "departure")!;
  assert.equal(pilotRequestText(a, departure, "06"), "Easy 571, ready for departure from runway 06");
  assert.equal(pilotRequestText(a, departure, "06", true), "Easy 571, ready for departure from runway 06, remaining in the pattern");
});
