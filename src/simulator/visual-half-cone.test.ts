import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor, applyEnvelope, autoReadbacks, advance, restoreExercise} from "./engine";
import {getAirport} from "./airports";
import {approachGeometry, assignRadar, moveRadar, visualClearanceUnable} from "./radar";
import {EXERCISE_WEATHER} from "./model";
import {exerciseSchema} from "./protocol";
import {advancePerformance} from "./aircraft-performance";

for (const side of [-1, 1]) for (const along of [4, 5, 7]) for (const lateral of [3, 4, 5]) {
  test(`EGLL 27L visual diagonal ${along}/${side * lateral} joins and lands`, () => {
    const weather = {...EXERCISE_WEATHER, windSpeed: 0};
    const state = engineFor({airport: "EGLL", trainingStation: "EGLL:approach", weather}).initialExercise();
    const airport = getAirport(state), a = state.aircraft[0], env = state.radarEnvironment!;
    const p = env.approaches.find(item => item.type === "visual" && item.runway === "27L")!, g = approachGeometry(airport, p.runway, p);
    Object.assign(a, {position: {x: g.threshold.x - g.vector.x * along - g.vector.y * side * lateral, y: g.threshold.y - g.vector.y * along + g.vector.x * side * lateral},
      heading: (g.heading + side * 45 + 360) % 360, targetHeading: (g.heading + side * 45 + 360) % 360,
      altitude: 1500, speed: 163, targetSpeed: 163, speedMode: "auto"});
    assignRadar(a, {type: "expect-approach", approachId: p.id}, airport, env);
    const clearance = {type: "vector", approachId: p.id} as const;
    assert.equal(visualClearanceUnable(a, clearance, airport, env, weather), null);
    assignRadar(a, clearance, airport, env); a.frequency = "tower"; a.radar!.transferred = true;
    assert.equal(a.radar!.approachIntercept?.visualRecovery, undefined, "a suitable base should turn directly onto final");
    for (let t = 0; t < 600 && !a.radar!.arrival && a.radar!.navigation !== "missed"; t += .05) moveRadar(a, .05, airport, env, [], true, weather);
    assert.equal(a.radar!.arrival?.phase, "rollout", JSON.stringify({position: a.position, heading: a.heading, altitude: a.altitude, radar: a.radar}));
  });
}

for (const height of [500, 4000]) test(`a close visual clearance at ${height}ft AGL is accepted and repositions to land`, () => {
  const weather = {...EXERCISE_WEATHER, windSpeed: 0};
  const state = engineFor({airport: "EGLL", trainingStation: "EGLL:approach", weather}).initialExercise();
  const airport = getAirport(state), a = state.aircraft[0], env = state.radarEnvironment!;
  const p = env.approaches.find(item => item.type === "visual" && item.runway === "27L")!, g = approachGeometry(airport, p.runway, p);
  Object.assign(a, {position: {x: g.threshold.x - g.vector.x * .2 - g.vector.y * 4, y: g.threshold.y - g.vector.y * .2 + g.vector.x * 4},
    heading: g.heading, targetHeading: g.heading, altitude: airport.elevation + height, speed: 163, targetSpeed: 163});
  assignRadar(a, {type: "expect-approach", approachId: p.id}, airport, env);
  assert.equal(visualClearanceUnable(a, {type: "vector", approachId: p.id}, airport, env, weather), null);
  state.running = true; state.autoReadback = true;
  const sent = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: a.id, frequency: "approach", text: "Visual", command: {type: "vector", approachId: p.id}}});
  assert.equal(sent.error, undefined);
  let reply = autoReadbacks(advance(sent.state, 2), 3000, randomUUID);
  assert.doesNotMatch(reply.messages.at(-1)!.text, /^Unable/);
  assert.equal(reply.aircraft[0].radar!.cleared, p.id);
  assert.ok(reply.aircraft[0].radar!.approachIntercept?.visualRecovery);
  const snapshot = JSON.stringify(reply);
  engineFor(reply).projectedPath(reply.aircraft[0], 30);
  assert.equal(JSON.stringify(reply), snapshot, "path prediction must not change the active join");
  reply = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(reply))));
  const handoff = applyEnvelope(reply, {id: randomUUID(), time: 3, action: {kind: "maneuver", aircraftId: a.id, command: {type: "frequency", frequency: "tower"}}});
  assert.equal(handoff.error, undefined); reply = handoff.state;
  let landed = false;
  for (let t = 0; t < 1200 && reply.aircraft.length; t++) {
    reply = advance(reply, 1); const flown = reply.aircraft[0];
    if (!flown || flown.radar?.arrival) {landed = true; break;}
    assert.notEqual(flown.radar!.navigation, "missed", flown.radar!.missedReason);
  }
  assert.ok(landed, "aircraft must rejoin final and land");
});

test("an older uncaptured visual snapshot plans its join without moving the aircraft", () => {
  const state = engineFor({airport: "EGLL", trainingStation: "EGLL:approach"}).initialExercise();
  const airport = getAirport(state), a = state.aircraft[0], env = state.radarEnvironment!;
  const p = env.approaches.find(item => item.type === "visual" && item.runway === "27L")!, g = approachGeometry(airport, p.runway, p);
  Object.assign(a, {position: {x: g.threshold.x - g.vector.x * .2 - g.vector.y * 4, y: g.threshold.y - g.vector.y * .2 + g.vector.x * 4},
    heading: g.heading, targetHeading: g.heading, altitude: airport.elevation + 1500, speed: 160, targetSpeed: 160});
  assignRadar(a, {type: "vector", approachId: p.id}, airport, env); delete a.radar!.approachIntercept;
  const before = {...a.position}; moveRadar(a, .05, airport, env, [], true);
  assert.ok(a.radar!.approachIntercept?.visualRecovery);
  assert.ok(Math.hypot(a.position.x - before.x, a.position.y - before.y) < .01);
});

for (const side of [-1, 1]) for (const windDirection of [0, 180]) test(`close visual recovery from side ${side} with wind ${windDirection}`, () => {
  const weather = {...EXERCISE_WEATHER, windDirection, windSpeed: 20};
  let state = engineFor({airport: "EGLL", trainingStation: "EGLL:approach", weather}).initialExercise();
  const airport = getAirport(state), a = state.aircraft[0], env = state.radarEnvironment!;
  const p = env.approaches.find(item => item.type === "visual" && item.runway === "27L")!, g = approachGeometry(airport, p.runway, p);
  Object.assign(a, {position: {x: g.threshold.x - g.vector.x * 2 - g.vector.y * side * 3, y: g.threshold.y - g.vector.y * 2 + g.vector.x * side * 3},
    heading: g.heading, targetHeading: g.heading, altitude: airport.elevation + 1500, speed: 180, targetSpeed: 180});
  assert.equal(visualClearanceUnable(a, {type: "vector", approachId: p.id}, airport, env, weather), null);
  assignRadar(a, {type: "vector", approachId: p.id}, airport, env, weather);
  a.frequency = "tower"; a.radar!.transferred = true; state.running = true;
  assert.ok(a.radar!.approachIntercept?.visualRecovery);
  let landed = false;
  for (let t = 0; t < 1800 && state.aircraft.length; t++) {
    state = advance(state, 1); const flown = state.aircraft[0];
    if (!flown || flown.radar?.arrival) {landed = true; break;}
    assert.notEqual(flown.radar!.navigation, "missed", flown.radar!.missedReason);
  }
  assert.ok(landed, "visual recovery should finish at the runway");
});

for (const side of [-1, 1]) for (const windDirection of [0, 90, 180, 270]) test(`wind ${windDirection}: diagonal visual from side ${side} completes after radio readback`, () => {
  const weather = {...EXERCISE_WEATHER, windDirection, windSpeed: 20};
  let state = engineFor({airport: "EGLL", trainingStation: "EGLL:approach", weather}).initialExercise();
  const airport = getAirport(state), a = state.aircraft[0], env = state.radarEnvironment!;
  const p = env.approaches.find(item => item.type === "visual" && item.runway === "27L")!, g = approachGeometry(airport, p.runway, p);
  Object.assign(a, {position: {x: g.threshold.x - g.vector.x * 5 - g.vector.y * side * 4, y: g.threshold.y - g.vector.y * 5 + g.vector.x * side * 4},
    heading: (g.heading + side * 45 + 360) % 360, targetHeading: (g.heading + side * 45 + 360) % 360,
    altitude: 1500, speed: 163, targetSpeed: 163, speedMode: "auto"});
  assignRadar(a, {type: "expect-approach", approachId: p.id}, airport, env);
  state.running = true; state.autoReadback = true;
  const sent = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: a.id, frequency: "approach", text: "Visual", command: {type: "vector", approachId: p.id}}});
  assert.equal(sent.error, undefined);
  state = autoReadbacks(advance(sent.state, 2), 3000, randomUUID);
  assert.doesNotMatch(state.messages.at(-1)!.text, /^Unable/);
  assert.equal(state.aircraft[0].radar!.cleared, p.id);
  const handoff = applyEnvelope(state, {id: randomUUID(), time: 3, action: {kind: "maneuver", aircraftId: a.id, command: {type: "frequency", frequency: "tower"}}});
  assert.equal(handoff.error, undefined); state = handoff.state;
  let landed = false;
  for (let t = 0; t < 600 && state.aircraft.length; t++) {
    state = advance(state, 1); const flown = state.aircraft[0];
    if (!flown || flown.radar?.arrival) {landed = true; break;}
    assert.notEqual(flown.radar!.navigation, "missed", flown.radar!.missedReason);
  }
  assert.ok(landed, "visual arrival should land");
});

for (const side of [-1, 1]) for (const speed of [180, 250]) test(`base visual at ${speed} kt from side ${side} is accepted and lands`, () => {
  const weather = {...EXERCISE_WEATHER, windSpeed: 0};
  let state = engineFor({airport: "EGLL", trainingStation: "EGLL:approach", weather}).initialExercise();
  const airport = getAirport(state), a = state.aircraft[0], env = state.radarEnvironment!;
  const p = env.approaches.find(item => item.type === "visual" && item.runway === "27L")!, g = approachGeometry(airport, p.runway, p);
  Object.assign(a, {position: {x: g.threshold.x - g.vector.x * 3 - g.vector.y * side * 2, y: g.threshold.y - g.vector.y * 3 + g.vector.x * side * 2},
    heading: (g.heading + side * 90 + 360) % 360, targetHeading: (g.heading + side * 90 + 360) % 360,
    altitude: airport.elevation + 1000, speed, targetSpeed: speed});
  assignRadar(a, {type: "expect-approach", approachId: p.id}, airport, env);
  state.running = true; state.autoReadback = true;
  const sent = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: a.id, frequency: "approach", text: "Visual", command: {type: "vector", approachId: p.id}}});
  assert.equal(sent.error, undefined); state = autoReadbacks(advance(sent.state, 2), 3000, randomUUID);
  assert.doesNotMatch(state.messages.at(-1)!.text, /^Unable/);
  assert.equal(state.aircraft[0].radar!.cleared, p.id);
  assert.equal(state.aircraft[0].radar!.approachIntercept?.visualRecovery, undefined);
  const handoff = applyEnvelope(state, {id: randomUUID(), time: 3, action: {kind: "maneuver", aircraftId: a.id, command: {type: "frequency", frequency: "tower"}}});
  assert.equal(handoff.error, undefined); state = handoff.state;
  let landed = false;
  for (let t = 0; t < 900 && state.aircraft.length; t++) {
    state = advance(state, 1); const flown = state.aircraft[0];
    if (!flown || flown.radar?.arrival) {landed = true; break;}
    assert.notEqual(flown.radar!.navigation, "missed", flown.radar!.missedReason);
  }
  assert.ok(landed, "base turn should end at the runway");
});

for (const [profile, speed] of [["C172", 100], ["A320", 180], ["B77W", 180]] as const) for (const side of [-1, 1]) {
  test(`${profile} joins visual final from either a base or a tight offset on side ${side}`, () => {
    const weather = {...EXERCISE_WEATHER, windSpeed: 0};
    for (const [along, lateral, angle] of [[2, 3, 0], [2, 6, 90], [4, 5, 45], [6, 3, 90]] as const) {
      const state = engineFor({airport: "EGLL", trainingStation: "EGLL:approach", weather}).initialExercise();
      const airport = getAirport(state), a = state.aircraft[0], env = state.radarEnvironment!;
      const p = env.approaches.find(item => item.type === "visual" && item.runway === "27L")!, g = approachGeometry(airport, p.runway, p);
      Object.assign(a, {performanceProfile: profile, position: {x: g.threshold.x - g.vector.x * along - g.vector.y * side * lateral, y: g.threshold.y - g.vector.y * along + g.vector.x * side * lateral},
        heading: (g.heading + side * angle + 360) % 360, targetHeading: (g.heading + side * angle + 360) % 360,
        altitude: airport.elevation + 1500, speed, targetSpeed: speed, speedMode: "auto"});
      assignRadar(a, {type: "vector", approachId: p.id}, airport, env); a.frequency = "tower"; a.radar!.transferred = true;
      for (let t = 0; t < 2400 && !a.radar!.arrival && a.radar!.navigation !== "missed"; t += .1) {
        const previous = {...a.position, altitude: a.altitude};
        moveRadar(a, .1, airport, env, [], true, weather);
        if (a.altitude > airport.elevation + 1) advancePerformance(a, previous, .1, weather);
      }
      assert.equal(a.radar!.arrival?.phase, "rollout", `${profile}, ${side * lateral} NM lateral, ${along} NM final, ${angle}°: ${a.radar!.missedReason}`);
    }
  });
}
