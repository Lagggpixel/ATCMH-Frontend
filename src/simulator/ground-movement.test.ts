import assert from "node:assert/strict";
import test from "node:test";
import {advance, AIRPORT, applyEnvelope, distance, initialExercise, newAircraft, predictAircraft, validateAssignment, engineFor, restoreExercise} from "./engine";
import {GROUND, moveGround, planPushback} from "./ground-movement";
import {planTaxiRoute} from "./taxi-routing";
import {standPlacement, gatesFor} from "./scenarios";
import {exerciseSchema, motionSchema} from "./protocol";
import {pilotRequests, pilotRequestText, resolvePilotRequest} from "./catalog";
import type {Aircraft, Exercise, Action, Instruction} from "./model";
import {randomUUID} from "node:crypto";
import {getAirport} from "./airports";
import {applyReplayDelta, replayDelta} from "./replays";

const taxi = (id: string, x: number, y = 0): Aircraft => ({...newAircraft(id, false), position: {x, y}, heading: 90, targetHeading: 90, mode: "taxi", speed: 15, targetSpeed: 15, taxiPath: [{x: 1, y: 0}], taxiIndex: 0});

const exercise = (aircraft: Aircraft[]): Exercise => ({...initialExercise(), aircraft, running: true});

const turn = (a: number, b: number) => Math.abs((b - a + 540) % 360 - 180);

test("short taxi turns stay inside their route instead of overshooting and circling back", () => {
  for (const gap of [.001, .003, .01, .03, .1]) for (const length of [.001, .003, .01, .03, .1]) {
    for (const bend of [-175, -135, -90, -45, -15, 15, 45, 90, 135, 175]) for (const speed of [3, 15, 20, 25, 35]) {
      const angle = bend * Math.PI / 180;
      const path = [{x: 0, y: gap}, {x: Math.sin(angle) * length, y: gap + Math.cos(angle) * length}];
      const a: Aircraft = {...taxi("tight-turn", 0), heading: 0, speed, targetSpeed: speed, expedited: speed === 25,
        ...(speed === 35 ? {arrivalExit: {instruction: "exit-runway", speed: 35}} : {})};
      let index = 0, rotation = 0;
      const label = `${gap}/${length}/${bend}/${speed}`;
      for (let frame = 0; frame < 6000 && index < path.length; frame++) {
        const previous = {...a.position}, previousHeading = a.heading, previousIndex = index, previousSpeed = a.speed;
        ({index} = moveGround(a, path, index, .05, false, {speedLimit: Infinity, travelLimit: Infinity}));
        assert.ok(a.position.y <= Math.max(path[0].y, path[1].y) + 1.02 / 1852, `${label}: overshot the turn`);
        assert.ok(distance(previous, a.position) <= Math.max(previousSpeed, a.speed) / 3600 * .05 + 1e-7, `${label}: no teleport`);
        assert.ok(turn(previousHeading, a.heading) <= GROUND.turnRate * .05 + 1e-7, `${label}: no heading snap`);
        rotation += turn(previousHeading, a.heading);
        assert.ok(rotation < 360, `${label}: circled a missed waypoint`);
        if (index !== previousIndex) rotation = 0;
      }
      assert.equal(index, path.length, `${label}: route completes`);
      assert.deepEqual(a.position, path.at(-1));
      assert.equal(a.speed, 0);
    }
  }
});

test("slow taxi traffic rounds a corner close to the centreline instead of cutting across the junction", () => {
  const a: Aircraft = {...taxi("slow-turn", 0), heading: 0, speed: 3, targetSpeed: 3};
  const path = [{x: 0, y: .1}, {x: .1, y: .1}];
  let index = 0;
  for (let frame = 0; frame < 30000 && index < path.length; frame++) {
    ({index} = moveGround(a, path, index, .05, false, {speedLimit: Infinity, travelLimit: Infinity}));
    const offset = Math.min(Math.abs(a.position.x), Math.abs(a.position.y - .1));
    assert.ok(offset < 2 / 1852, "a slow turn remains within two metres of the mapped centreline");
  }
  assert.equal(index, path.length);
});

test("all 168 mapped EGPH stand/S/G departure routes finish without orbiting intermediate waypoints", () => {
  let completed = 0;
  for (const feature of AIRPORT.features.filter(f => f.kind === "parking_position" || f.name === "S" || f.name === "G")) {
    for (const runway of ["24", "06"] as const) {
      const position = feature.points.at(-1)!;
      const route = planTaxiRoute(AIRPORT, position, runway); if (!route.path) continue;
      const a = {...taxi(feature.id, position.x, position.y), taxiPath: route.path};
      let index = 0, held = false, rotation = 0;
      const label = `${feature.name}/${runway}`;
      for (let frame = 0; frame < 36000 && !held && index < route.path.length; frame++) {
        const oldIndex = index, oldPosition = {...a.position}, oldHeading = a.heading;
        ({index, held} = moveGround(a, route.path, index, .05, false, {speedLimit: Infinity, travelLimit: Infinity}));
        assert.ok(distance(oldPosition, a.position) <= 15 / 3600 * .05 + 1e-7, `${label}: no teleporting`);
        assert.ok(turn(oldHeading, a.heading) <= GROUND.turnRate * .05 + 1e-7, `${label}: bounded turn rate`);
        rotation += turn(oldHeading, a.heading);
        assert.ok(rotation < 360, `${label}: orbiting waypoint ${oldIndex} (${rotation} degrees)`);
        if (index !== oldIndex) rotation = 0;
      }
      assert.equal(held, false, `${label}: destination entry is not an active Hold instruction`);
      assert.equal(index, route.path.length, `${label}: reaches the final entry`);
      assert.deepEqual(a.position, {x: route.path.at(-1)!.x, y: route.path.at(-1)!.y});
      completed++;
    }
  }
  assert.equal(completed, 168);
});

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
  const requests = pilotRequests(a).filter(r => !["minimum-fuel", "emergency-fuel"].includes(r.id));
  assert.deepEqual(requests.map(r => r.label), ["Excellent Service, Thanks!","Back with you","Roger","Wilco","Stand by","Unable","Correction","Request runway crossing", "Frequency Change", "Request Takeoff", "Request Runway Change"]);
  assert.ok(!requests.some(r => r.id === "pattern-entry"));
  assert.equal(resolvePilotRequest({label: "Request pattern entry"})?.id, "pattern-entry");
  const departure = requests.find(r => r.id === "departure")!;
  assert.equal(pilotRequestText(a, departure, "06"), "Easy 571, ready for departure at runway 06");
  assert.equal(pilotRequestText(a, departure, "06", true), "Easy 571, ready for departure at runway 06, remaining in the pattern");
});

const act = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
};

const kdal = getAirport({airport: "KDAL"}), engine = engineFor({airport: "KDAL"});

const stateOf = (aircraft: Aircraft[]): Exercise => ({...engine.initialExercise(), aircraft, running: true});

const assign = (state: Exercise, instruction: Instruction) => act(state, {kind: "maneuver", aircraftId: state.aircraft[0].id, command: instruction});

test("overlapping Local pushbacks remain visible on both frequencies and survive replay recovery", () => {
  const create = (id: string, x: number, heading: number): Aircraft => ({...engine.newAircraft(id, false), mode: "pushback", position: {x, y: 0}, heading, targetHeading: heading, speed: 3, targetSpeed: 3, pushback: {path: [{x: -x, y: 0}, {x: -x * 2, y: 0}], index: 0}});
  const before = stateOf([create("a", -.04, 270), {...create("b", .04, 90), frequency: "tower"}]);
  let state = before;
  for (let t = 0; t < 60 && state.aircraft.some(a=>a.active); t++) state = advance(state, 1);
  assert.equal(state.aircraft.filter(a=>a.active).length, 2); assert.equal(state.collisions?.length ?? 0, 0);
  assert.deepEqual(state.aircraft.map(a => a.id), ["a", "b"]);
  assert.equal(motionSchema.parse(state).collisions?.length ?? 0, 0);
  assert.deepEqual(applyReplayDelta(before, replayDelta(before, state)), state);
  const reloaded = restoreExercise(exerciseSchema.parse(state));
  assert.deepEqual(reloaded.collisions, state.collisions);
  assert.equal(advance(reloaded, 5).collisions?.length ?? 0, 0);
  let reverse = {...before, aircraft: before.aircraft.toReversed()};
  for (let t = 0; t < 60 && reverse.aircraft.length; t++) reverse = advance(reverse, 1);
  assert.deepEqual(reverse.collisions, state.collisions);
  assert.equal(before.aircraft.length, 2, "motion never mutates its input");
});

test("a held pushback can resume its remaining route after the obstruction is removed", () => {
  const gate = gatesFor(kdal).find(g => g.name === "13")!;
  const a = {...engine.newAircraft("a", false), ...standPlacement(gate.id, false, kdal)!};
  let state = assign(stateOf([a]), {type: "pushback", tail: "east"});
  state = advance(state, 5); const path = state.aircraft[0].pushback!.path;
  state = assign(state, {type: "stop"}); state = advance(state, 1);
  const position = state.aircraft[0].position;
  state = assign(state, {type: "pushback", tail: "east"});
  assert.deepEqual(state.aircraft[0].pushback!.path, path);
  state = advance(state, 5);
  assert.notDeepEqual(state.aircraft[0].position, position);
});

test("conflicting real KDAL gate pushbacks never crash or disappear in Local training", () => {
  for (const tail of ["east", "west"] as const) {
    let state = stateOf(["13", "15"].map(name => {
      const gate = gatesFor(kdal).find(g => g.name === name)!;
      return {...engine.newAircraft(name, false), ...standPlacement(gate.id, false, kdal)!};
    }));
    for (const aircraft of state.aircraft) state = act(state, {kind: "maneuver", aircraftId: aircraft.id, command: {type: "pushback", tail}});
    for (let t = 0; t < 180 && state.aircraft.length === 2; t++) state = advance(state, 1);
    assert.equal(state.aircraft.length, 2);
    assert.equal(state.collisions?.length ?? 0, 0);
  }
});
