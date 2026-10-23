import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {engineFor} from "./engine";
import {flightVelocity} from "./aircraft-performance";
import type {Action, Exercise} from "./model";
import {exerciseSchema} from "./protocol";
import {createScenarioExercise, scenarioFromExercise, type ScenarioRuntime} from "./scenarios";
import {MemoryStore} from "./session-test-store";
import {SessionService, type Actor} from "./server/session-service";
import {SESSION_FRAME_MS, SESSION_LEASE_MS} from "./sessions";

const staff: Actor = {accountId: "101", staff: true};
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function flight(mode: "local" | "approach", speed = 360): Exercise {
  const engine = engineFor({trainingStation: `EGPH:${mode}`}), exercise = engine.initialExercise();
  const a = mode === "local" ? engine.newAircraft("air", true) : exercise.aircraft[0];
  Object.assign(a, {position: {x: 50, y: 50}, heading: 90, targetHeading: 90, speed, targetSpeed: speed, speedMode: "manual", altitude: 10000, mode: "heading", leavingCircuit: true});
  delete a.performanceProfile;
  if (mode === "approach") {a.radar = {station: "approach", navigation: "heading", routeIndex: 0}; a.frequency = "approach";}
  exercise.aircraft = [a]; return exerciseSchema.parse(exercise);
}
async function setup(exercise = flight("approach"), runtime?: ScenarioRuntime) {
  const store = new MemoryStore(); let now = 1_000_000;
  const service = new SessionService(store, () => now, randomUUID);
  const session = await service.create(staff, "Timing regression", exercise, runtime), token = randomUUID();
  await service.join(staff, session.id, "staff", token);
  const send = (action: Action) => service.dispatch(staff, session.id, "staff", token, {id: randomUUID(), time: 0, action});
  await send({kind: "auto-readback", enabled: false});
  await send({kind: "play"});
  const frame = () => service.frame(staff, session.id, "staff", token);
  return {store, service, session, token, send, frame, delay: (ms: number) => {now += ms;}};
}
async function fly(h: Awaited<ReturnType<typeof setup>>, durationMs: number, cadence: number[]) {
  let elapsed = 0, index = 0;
  while (elapsed < durationMs) {
    const dt = Math.min(cadence[index++ % cadence.length], durationMs - elapsed);
    elapsed += dt; h.delay(dt); await h.frame();
  }
  return (await h.frame()).exercise;
}

for (const mode of ["local", "approach"] as const) for (const speed of [180, 360]) {
  for (const cadence of [[SESSION_FRAME_MS], [2100], [6000], [SESSION_LEASE_MS - 1], [200, 2100, 6000, 3700, 12000]]) {
    test(`${mode}: ${speed}kt covers the correct distance over 60 seconds at ${cadence.join("/")}ms cadence`, async () => {
      const h = await setup(flight(mode, speed)), before = (await h.frame()).exercise.aircraft[0];
      const exercise = await fly(h, 60000, cadence), after = exercise.aircraft[0];
      near(exercise.elapsed, 60); near(after.speed, speed);
      near(after.position.x - before.position.x, speed / 60);
      near(after.position.y, before.position.y);
    });
  }
}

test("profiled aircraft retain TAS/wind ground speed during delayed updates", async () => {
  const exercise = flight("approach", 240); exercise.aircraft[0].performanceProfile = "A320";
  exercise.weather = {windDirection: 90, windSpeed: 20, visibilityKm: 10, qnh: 1013.25, temperature: 15, reference: "Timing test"};
  const velocity = flightVelocity(exercise.aircraft[0], exercise.weather), h = await setup(exercise);
  const before = (await h.frame()).exercise.aircraft[0], after = (await fly(h, 60000, [6000])).aircraft[0];
  near(after.position.x - before.position.x, velocity.x / 60);
  near(after.position.y - before.position.y, velocity.y / 60);
  near(after.groundSpeed!, Math.hypot(velocity.x, velocity.y));
});

test("delayed automatic readbacks change speed at the same time as regular frames", async () => {
  async function run(cadence: number[]) {
    const h = await setup(flight("approach", 180)), aircraftId = (await h.frame()).exercise.aircraft[0].id;
    await h.send({kind: "auto-readback", enabled: true});
    await h.send({kind: "command", aircraftId, frequency: "approach", text: "", command: {type: "radar-speed", mode: "maintain", unit: "knots", value: 240, relation: "exact"}});
    return fly(h, 12000, cadence);
  }
  const regular = await run([200]), delayed = await run([6000]);
  near(delayed.elapsed, regular.elapsed); near(delayed.aircraft[0].speed, regular.aircraft[0].speed);
  near(delayed.aircraft[0].position.x, regular.aircraft[0].position.x);
  near(delayed.aircraft[0].position.y, regular.aircraft[0].position.y);
  const replies = delayed.messages.filter(m => m.sender === "pilot" && m.commandId);
  assert.equal(replies.length, 1); assert.equal(replies[0].time, regular.messages.find(m => m.sender === "pilot" && m.commandId)!.time);
  assert.ok(delayed.aircraft[0].speed > 180);
});

test("delayed scenario frames spawn traffic at the authored time, not at the end of the delay", async () => {
  const definition = scenarioFromExercise(flight("approach"), "Timed flight"), key = definition.aircraft[0].key;
  definition.aircraft[0].initial = false;
  definition.events = [{id: "arrival", title: "Arrival", trigger: {type: "time", at: 6}, actions: [{type: "spawn", aircraftKey: key}]}];
  const created = createScenarioExercise(definition, randomUUID(), randomUUID()), h = await setup(created.exercise, created.runtime);
  h.delay(12000); const frame = await h.frame(), a = frame.exercise.aircraft[0];
  near(frame.exercise.elapsed, 12); near(a.position.x - definition.aircraft[0].seed.position.x, .6);
  assert.equal(frame.scenario!.events[0].status, "completed"); near(frame.scenario!.events[0].completedAt!, 6);
});

test("pausing excludes the delayed interval and resuming does not catch it up", async () => {
  const h = await setup(); await fly(h, 6000, [6000]); await h.send({kind: "pause"});
  const paused = (await h.frame()).exercise; h.delay(12000);
  assert.deepEqual((await h.frame()).exercise, paused);
  await h.send({kind: "play"}); const resumed = await fly(h, 6000, [6000]);
  near(resumed.elapsed, 12); near(resumed.aircraft[0].position.x - 50, 1.2);
});

test("leaving all seats prevents offline catch-up even for a short disconnection", async () => {
  const h = await setup(); const before = (await h.frame()).exercise;
  await h.service.leave(staff, h.session.id, "staff", h.token); h.delay(6000);
  const joined = await h.service.join(staff, h.session.id, "staff", h.token);
  assert.deepEqual(joined.exercise, before);
  const after = await fly(h, 6000, [6000]); near(after.elapsed, 6); near(after.aircraft[0].position.x - 50, .6);
});

test("an expired connection cannot advance traffic; rejoining resumes without the offline gap", async () => {
  const h = await setup(), before = (await h.frame()).exercise;
  h.delay(SESSION_LEASE_MS);
  await assert.rejects(h.frame(), {code: "seat-lost"});
  const joined = await h.service.join(staff, h.session.id, "staff", h.token);
  assert.deepEqual(joined.exercise, before);
  const after = await fly(h, 6000, [6000]); near(after.elapsed, 6); near(after.aircraft[0].position.x - 50, .6);
});

test("staff and mentee frames at the same time cannot double-count a delayed interval", async () => {
  const h = await setup(), mentee: Actor = {accountId: "102", staff: false}, token = randomUUID();
  await h.service.join(mentee, h.session.id, "mentee", token); h.delay(6000);
  const frames = await Promise.all([h.frame(), h.service.frame(mentee, h.session.id, "mentee", token), h.frame()]);
  for (const frame of frames) {near(frame.exercise.elapsed, 6); near(frame.exercise.aircraft[0].position.x - 50, .6);}
});

test("a delayed command first advances movement, then applies the command", async () => {
  const h = await setup(); h.delay(6000); await h.send({kind: "pause"});
  const frame = await h.frame(); near(frame.exercise.elapsed, 6); near(frame.exercise.aircraft[0].position.x - 50, .6);
  assert.equal(frame.exercise.running, false);
});

