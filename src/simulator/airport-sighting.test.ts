import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor, restoreExercise} from "./engine";
import {getAirport} from "./airports";
import {advanceAirportSighting, sightingTargetKey, sightingGeometry, terrainSightLine} from "./airport-sighting";
import {exerciseSchema} from "./protocol";
import {ReplayTimeline, replayDelta} from "./replays";
import {AirportSightings} from "./server/airport-sightings";
import {SessionService} from "./server/session-service";
import {MemoryStore} from "./session-test-store";

function fixture() {
  const e = engineFor({trainingStation: "EGPH:approach"}), state = e.initialExercise(), airport = getAirport(state);
  state.running = true; state.autoReadback = true; state.messages = []; state.aircraft = [state.aircraft[0]];
  const a = state.aircraft[0]; delete a.radar!.report;
  Object.assign(a, {position: {x: 0, y: -10}, heading: 0, targetHeading: 0, altitude: airport.elevation + 3000, reportAirportInSight: true});
  a.airportSighting = {target: sightingTargetKey(a, airport), seconds: 0, terrain: {position: {...a.position}, altitude: a.altitude, checkedAt: 0, status: "clear"}};
  return {e, state, a, airport};
}
test("RAIS waits three simulation seconds, survives reload, and reports only once", () => {
  const {e, state, a} = fixture();
  const before = structuredClone(state);
  let next = e.advance(state, 2.5); next = e.autoReadbacks(next, 2500, randomUUID);
  assert.equal(next.messages.length, 0); assert.equal(a.airportSighting!.seconds, 0, "advance must not mutate the original");
  next = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(next))));
  const paused = {...next, running: false}; assert.equal(e.advance(paused, 5), paused);
  next = e.autoReadbacks(e.advance(next, .5), 3000, randomUUID);
  assert.equal(next.messages.length, 1); assert.match(next.messages[0].text, /Airport in sight/);
  assert.equal(next.aircraft[0].reportAirportInSight, undefined);
  assert.equal(e.autoReadbacks(e.advance(next, 1), 4000, randomUUID).messages.length, 1);
  assert.equal(new ReplayTimeline(before, [{sequence: 1, at: 3, interpolate: false, delta: replayDelta(before, next)}]).at(3).messages.length, 1);
});
test("blocked, missing, stale and displaced samples reset sighting; weather does not gate it", () => {
  for (const condition of ["blocked", "unavailable", "missing", "stale", "displaced", "automatic-off", "inactive"] as const) {
    const {a, airport} = fixture(); a.airportSighting!.seconds = 2;
    if (condition === "blocked" || condition === "unavailable") a.airportSighting!.terrain!.status = condition;
    if (condition === "missing") delete a.airportSighting!.terrain;
    if (condition === "displaced") a.position.x += 1;
    if (condition === "inactive") a.active = false;
    advanceAirportSighting(a, airport, 1, condition === "stale" ? 9 : 1, condition !== "automatic-off");
    assert.equal(a.airportSighting!.seconds, 0, condition);
  }
});
test("sighting state remains valid with an escaped destination name", () => {
  const {state, a, airport} = fixture();
  a.destination = {name: "\"".repeat(100), point: {x: 0, y: 0}};
  advanceAirportSighting(a, airport, .05, 0, true);
  assert.ok(exerciseSchema.safeParse(state).success);
});
test("side views are valid, high slant distance and views behind are not; destination changes restart the check", () => {
  const {a, airport} = fixture(); a.heading = 90; assert.ok(sightingGeometry(a, airport));
  a.heading = 100; assert.equal(sightingGeometry(a, airport), false);
  a.heading = 0; a.altitude = airport.elevation + 60000; a.position.y = -14;
  assert.equal(sightingGeometry(a, airport), false);
  a.airportSighting!.seconds = 2; a.destination = {name: "Other", point: {x: 5, y: 0}};
  advanceAirportSighting(a, airport, 1, 1, true); assert.equal(a.airportSighting!.seconds, 0); assert.equal(a.airportSighting!.terrain, undefined);
});
test("terrain screening detects an intervening ridge and rejects incomplete samples", () => {
  assert.equal(terrainSightLine(3000, [100, 100, 100, 100]), "clear");
  assert.equal(terrainSightLine(3000, [100, 4000, 100, 100]), "blocked");
  assert.equal(terrainSightLine(3000, [100, NaN, 100]), "unavailable");
  assert.equal(terrainSightLine(3000, new Array(3)), "unavailable");
});
test("switching Automatic off resets an in-progress sighting even while paused", () => {
  const {state, e, a} = fixture(); state.running = false; a.airportSighting!.seconds = 2;
  const result = e.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "auto-readback", enabled: false}});
  assert.equal(result.state.aircraft[0].airportSighting!.seconds, 0);
});
test("manual pilot report clears the pending automatic request", () => {
  const {state, e, a} = fixture(); a.airportSighting!.terrain!.status = "unavailable";
  const result = e.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "pilot", aircraftId: a.id, text: "", request: {id: "airport-in-sight", runway: a.runway!}}});
  assert.equal(result.error, undefined); assert.equal(result.state.aircraft[0].reportAirportInSight, undefined);
  assert.equal(e.autoReadbacks(e.advance(result.state, 5), 5000, randomUUID).messages.length, 1);
});
test("background terrain profiles apply only to the sampled destination and fail closed", async () => {
  for (const failed of [false, true]) {
    const {state, a} = fixture(); delete a.airportSighting;
    const provider = new AirportSightings(async () => {if (failed) throw new Error("offline"); return 100;}, () => 0);
    provider.request(state); await new Promise(resolve => setImmediate(resolve)); provider.apply(state);
    assert.equal(a.airportSighting?.terrain?.status, failed ? "unavailable" : "clear");
    a.destination = {name: "Elsewhere", point: {x: 5, y: 5}}; delete a.airportSighting;
    provider.apply(state); assert.equal(a.airportSighting, undefined);
  }
});
test("the authoritative session continues while terrain is pending and requests outside the transaction", async () => {
  const {state} = fixture(); delete state.aircraft[0].airportSighting;
  const store = new MemoryStore(), actor = {accountId: "trainer", staff: true}; let now = 0, requests = 0;
  const service = new SessionService(store, () => now, randomUUID, {apply: () => {}, request: exercise => {requests++; assert.equal(store.records.get(exercise.id)!.exercise.elapsed, exercise.elapsed);}});
  const session = await service.create(actor, "Sighting", state); await service.join(actor, session.id, "staff", "seat");
  now = 1000; const view = await service.frame(actor, session.id, "staff", "seat");
  assert.ok(Math.abs(view.exercise.elapsed - 1) < 1e-9); assert.equal(requests, 1); assert.equal(view.exercise.messages.length, 0);
});
test("one failed terrain read does not release a worker while its other reads are pending", async () => {
  const {state, a} = fixture();
  state.aircraft = [a, {...structuredClone(a), id: "second"}, {...structuredClone(a), id: "third"}];
  let release!: () => void, reads = 0;
  const pending = new Promise<void>(resolve => {release = resolve;});
  const provider = new AirportSightings(async () => {
    if (++reads === 1) throw new Error("one failed read");
    await pending; return 100;
  }, () => 0);
  provider.request(state);
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 12, "only two profiles may run, with six reads each");
  } finally {release();}
  await new Promise(resolve => setImmediate(resolve));
  provider.apply(state);
  assert.equal(state.aircraft[0].airportSighting?.terrain?.status, "unavailable");
  assert.equal(state.aircraft[2].airportSighting?.terrain?.status, "clear");
});
