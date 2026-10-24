import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {AIRPORT, advance, applyEnvelope, autoReadbacks, createAirportEngine, distance, initialExercise, predictAircraft, restoreExercise, runwayExitRoute, runwayGeometry, validateAssignment} from "./engine";
import {messageMenu} from "./catalog";
import {exerciseSchema, envelopeSchema} from "./protocol";
import type {Aircraft, Airport, Exercise, Instruction, Runway} from "./model";

const save = (state: Exercise) => restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
const act = (state: Exercise, command: Instruction) => {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action: {kind: "maneuver", aircraftId: state.aircraft[0].id, command}});
  assert.equal(result.error, undefined); return result.state;
};
function rollout(runway: Runway = "24", speed = 135, along = 0) {
  const state = initialExercise(), a = state.aircraft[0], g = runwayGeometry(runway);
  state.aircraft = [a]; state.running = true; state.autoReadback = true;
  Object.assign(a, {runway, mode: "rollout", landing: "full-stop", altitude: AIRPORT.elevation, speed, targetSpeed: 0,
    heading: g.heading, targetHeading: g.heading, position: {x: g.threshold.x + g.vector.x * along, y: g.threshold.y + g.vector.y * along}});
  return state;
}
function tick(state: Exercise, seconds: number, radio = true): Exercise {
  for (let i = 0; i < seconds; i++) {
    state = advance(state, Math.min(1, seconds - i));
    if (radio) state = autoReadbacks(state, 1000 + state.elapsed * 1000, randomUUID);
  }
  return state;
}
const lateral = (a: Aircraft) => {
  const g = runwayGeometry(a.runway!);
  return (a.position.x - g.threshold.x) * -g.vector.y + (a.position.y - g.threshold.y) * g.vector.x;
};

function mappedExit(widthFeet: number, join: number, end: number, along = .1, speed = 0) {
  const runway = {id: "18/36", lengthFeet: 6076, widthFeet, ends: [
    {id: "36", heading: 0, point: {x: 0, y: 0}}, {id: "18", heading: 180, point: {x: 0, y: 1}},
  ]};
  const airport: Airport = {...AIRPORT, runway, runways: [runway], features: [
    {id: "exit", kind: "taxiway", name: "A", points: [{x: join, y: .4}, {x: end, y: .4}]},
  ]};
  const engine = createAirportEngine(airport), a = engine.newAircraft("exit-test", false);
  Object.assign(a, {runway: "36", position: {x: 0, y: along}, mode: "rollout", speed, targetSpeed: 0});
  return {engine, a, route: engine.runwayExitRoute(a, "any")};
}

test("mapped exits can join the pavement edge but cannot bridge an off-runway gap", () => {
  const connected = mappedExit(200, -.014, -.08);
  assert.equal(connected.route.error, undefined);
  assert.equal(connected.route.speed, 15, "a perpendicular exit retains its ordinary turn speed");
  assert.deepEqual(connected.route.path?.slice(0, 2), [{x: 0, y: .1}, {x: 0, y: .4}]);
  assert.ok(mappedExit(200, -.025, -.08).route.error, "a parallel taxiway outside the pavement is not a runway exit");
});

test("narrow-runway exits clear the pavement plus its safety margin before completing", () => {
  const {route} = mappedExit(59, 0, .05);
  assert.equal(route.error, undefined);
  assert.ok(route.path!.at(-1)!.x >= .04 + 59 / (2 * 6076) - 1e-7);
  assert.ok(route.path!.at(-1)!.x < .05, "a narrow runway does not require a nonexistent wide-runway connector");
  assert.ok(mappedExit(200, 0, .05).route.error, "the same short connector does not clear a wider runway");
});

test("stopped traffic can reach a close exit while fast traffic still needs braking distance", () => {
  assert.equal(mappedExit(200, 0, .08, .395).route.error, undefined);
  assert.ok(mappedExit(200, 0, .08, .395, 70).route.error);
});

test("full-stop touchdowns automatically choose a reachable exit on both runways", () => {
  for (const runway of ["24", "06"] as const) {
    let state = rollout(runway);
    const a = state.aircraft[0], g = runwayGeometry(runway);
    Object.assign(a, {mode: "pattern", leg: "final", clearedToLand: true, altitude: AIRPORT.elevation + 10,
      position: {x: g.threshold.x - g.vector.x * .003, y: g.threshold.y - g.vector.y * .003}});
    state = tick(state, 2);
    assert.equal(state.aircraft[0].mode, "rollout"); assert.ok(state.aircraft[0].runwayExit);
    const restored = save(state);
    state = tick(restored, 300);
    assert.equal(state.aircraft[0].mode, "parked"); assert.ok(Math.abs(lateral(state.aircraft[0])) >= .05999);
    assert.equal(state.aircraft[0].frequency, "tower");
    assert.deepEqual(state.messages.map(m => m.text), [`${a.callsign}, requesting frequency change`]);
    assert.equal(tick(save(state), 20).messages.length, 1);
  }
});

test("forward connected exits use rapid-exit speeds without choosing backward connectors", () => {
  for (const runway of ["24", "06"] as const) for (const speed of [0, 70, 135]) {
    let state = rollout(runway, speed), a = state.aircraft[0];
    const route = runwayExitRoute(a, "any"); assert.equal(route.error, undefined);
    assert.equal(route.speed, 35);
    const g = runwayGeometry(runway), entry = route.path![1];
    const along = (entry.x - g.threshold.x) * g.vector.x + (entry.y - g.threshold.y) * g.vector.y;
    if (speed === 70) assert.ok(along > .3 && along < .4, "near-perpendicular mapped drift does not hide a reachable forward exit");
    if (speed === 135) assert.ok(along > .9 && along < 1.1, "skip exits before the braking distance");
    let entered = false;
    for (let i = 0; i < 10000; i++) {
      state = advance(state, .05); a = state.aircraft[0];
      if (a.mode === "taxi") {
        assert.ok(distance(a.position, entry) < 1e-7, "turn only at the mapped entry");
        assert.equal(a.speed, route.speed); entered = true; break;
      }
      assert.ok(Math.abs(lateral(a)) < 1e-7, "decelerate and continue along the centerline");
    }
    assert.equal(entered, true);
    state = tick(save(state), 300);
    assert.ok(distance(state.aircraft[0].position, route.path!.at(-1)!) < 1e-7);
    assert.equal(state.aircraft[0].arrivalExit, undefined);
  }
});

test("exit-only commands respect the side and automatically contact Ground and request parking", () => {
  for (const runway of ["24", "06"] as const) {
    const side = runway === "24" ? "left" : "right";
    let state = act(rollout(runway, 70), {type: "exit-runway", side});
    state = tick(save(state), 300);
    assert.ok(Math.abs(lateral(state.aircraft[0])) >= .05999); assert.equal(Math.sign(lateral(state.aircraft[0])), side === "left" ? 1 : -1); assert.equal(state.aircraft[0].frequency, "ground");
    assert.equal(state.messages.length, 1); assert.match(state.messages[0].text, /requesting taxi to parking/);
  }
});

test("Tower parking commands vacate before retuning and requesting parking once on Ground", () => {
  for (const runway of ["24", "06"] as const) {
    let state = rollout(runway, 70);
    state.aircraft[0].taxiPath = [];
    assert.equal(validateAssignment(state.aircraft[0], {type: "taxi", destination: "parking"}), null);
    state = act(state, {type: "taxi", destination: "parking"});
    const route = state.aircraft[0].runwayExit;
    assert.equal(state.aircraft[0].frequency, "tower"); assert.equal(state.aircraft[0].mode, "rollout");
    state = tick(save(state), 10); assert.equal(state.aircraft[0].frequency, "tower"); assert.equal(state.messages.length, 0);
    assert.deepEqual(state.aircraft[0].runwayExit, route);
    state = tick(state, 300, false);
    assert.equal(state.aircraft[0].frequency, "ground"); assert.equal(state.aircraft[0].arrivalRequest, "taxi-parking");
    state = autoReadbacks(save(state), 400000, randomUUID);
    assert.deepEqual(state.messages.map(m => [m.frequency, m.text]), [["ground", `${state.aircraft[0].callsign}, requesting taxi to parking`]]);
    assert.equal(tick(save(state), 10).messages.length, 1);
  }
});

test("parking can replace an exit instruction during the connector without rewinding the route", () => {
  let state = act(rollout("24", 70), {type: "exit-runway", side: "left"});
  while (state.aircraft[0].mode === "rollout") state = advance(state, .05);
  const before = structuredClone(state.aircraft[0]);
  state = act(state, {type: "taxi", destination: "parking"});
  assert.deepEqual(state.aircraft[0].taxiPath, before.taxiPath); assert.equal(state.aircraft[0].taxiIndex, before.taxiIndex);
  assert.deepEqual(state.aircraft[0].position, before.position);
  state = tick(save(state), 300);
  assert.equal(state.aircraft[0].frequency, "ground"); assert.equal(state.messages.length, 1);
});

test("Tower parking after vacating requests Ground parking without requiring another taxi route", () => {
  let state = tick(act(rollout(), {type: "exit-runway", side: "any"}), 300);
  assert.equal(state.aircraft[0].mode, "parked");
  state = act(state, {type: "taxi", destination: "parking"});
  state = autoReadbacks(state, 400000, randomUUID);
  assert.equal(state.aircraft[0].frequency, "ground"); assert.equal(state.messages[0].frequency, "ground");
  assert.match(state.messages[0].text, /requesting taxi to parking/);
});

test("pausing and motion predictions cannot send requests or retune arrival traffic", () => {
  let state = act(rollout("24", 70), {type: "taxi", destination: "parking"});
  state = tick(state, 300, false);
  state.aircraft[0].frequency = "tower";
  state.aircraft[0].arrivalExit = {instruction: "parking", speed: 35}; delete state.aircraft[0].arrivalRequest;
  const before = structuredClone(state);
  assert.equal(predictAircraft(state.aircraft, 1.5)[0].frequency, "tower"); assert.deepEqual(state, before);
  state.running = false;
  assert.deepEqual(autoReadbacks(advance(state, 5), 500000, randomUUID), state);
});

test("touch-and-go traffic stays on the runway and starts another takeoff", () => {
  const state = rollout(); state.aircraft[0].landing = "touch-and-go";
  const next = tick(state, 1);
  assert.equal(next.aircraft[0].mode, "takeoff"); assert.equal(next.aircraft[0].runwayExit, undefined);
  assert.equal(next.messages.length, 0);
});

test("Tower offers parking and arrival automation state is server-owned in the protocol", () => {
  const a = rollout().aircraft[0];
  assert.ok(!messageMenu("tower", a).some(m => m.instruction?.type === "taxi" && m.instruction.destination === "parking"));
  for (const patch of [{arrivalExit: {instruction: "parking", speed: 35}}, {arrivalRequest: "taxi-parking"}]) {
    assert.equal(envelopeSchema.safeParse({id: "edit", time: 1, action: {kind: "edit", aircraftId: a.id, patch}}).success, false);
  }
});
