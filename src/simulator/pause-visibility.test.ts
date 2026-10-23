import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {advance, applyEnvelope, initialExercise} from "./engine";
import {envelopeSchema, exerciseSchema} from "./protocol";
import {MemoryStore} from "./session-test-store";
import {SessionService} from "./server/session-service";
import {applyReplayDelta, replayDelta} from "./replays";

for (const visibility of ["hidden", "visible"] as const) test(`${visibility} pause freezes time, persists through snapshots/replay and prohibits learner commands`, async () => {
  const store = new MemoryStore(), service = new SessionService(store, () => 1000);
  const staff = {accountId: "mentor", staff: true}, learner = {accountId: "learner", staff: false};
  const initial = initialExercise(), row = await service.create(staff, "Pause check", initial);
  const staffToken = randomUUID(), learnerToken = randomUUID();
  await service.join(staff, row.id, "staff", staffToken);
  await service.join(learner, row.id, "mentee", learnerToken);
  const send = (action: unknown) => service.dispatch(staff, row.id, "staff", staffToken, envelopeSchema.parse({id: randomUUID(), time: 1000, action}));
  await send({kind: "play"});
  await send({kind: "pause", visibility});
  const paused = (await service.frame(learner, row.id, "mentee", learnerToken)).exercise;
  assert.equal(paused.running, false);
  assert.equal(paused.pausedByStaff, true);
  assert.equal(paused.pauseVisibility, visibility);
  assert.deepEqual(advance(paused, 5), paused);
  assert.equal(exerciseSchema.parse(JSON.parse(JSON.stringify(paused))).pauseVisibility, visibility);
  assert.deepEqual(applyReplayDelta(initial, replayDelta(initial, paused)), paused);
  await assert.rejects(service.dispatch(learner, row.id, "mentee", learnerToken, {id: randomUUID(), time: 1000, action: {kind: "read", aircraftId: paused.aircraft[0].id, frequency: "ground"}}), /paused/);
  await send({kind: "edit", aircraftId: paused.aircraft[0].id, patch: {position: {x: 4, y: 5}}});
  assert.deepEqual((await service.frame(learner, row.id, "mentee", learnerToken)).exercise.aircraft[0].position, {x: 4, y: 5});
  await send({kind: "pause", visibility: visibility === "visible" ? "hidden" : "visible"});
  assert.equal((await service.frame(learner, row.id, "mentee", learnerToken)).exercise.pauseVisibility, visibility === "visible" ? "hidden" : "visible");
  await send({kind: "play"});
  const resumed = (await service.frame(learner, row.id, "mentee", learnerToken)).exercise;
  assert.equal(resumed.running, true);
  assert.equal(resumed.pausedByStaff, false);
});

test("legacy pause commands default to hiding the view; invalid visibility is rejected", () => {
  const initial = initialExercise();
  const paused = applyEnvelope(initial, {id: randomUUID(), time: 1000, action: {kind: "pause"}}).state;
  assert.equal(paused.pauseVisibility, "hidden");
  assert.equal(envelopeSchema.safeParse({id: randomUUID(), time: 1000, action: {kind: "pause", visibility: "invalid"}}).success, false);
  assert.equal(exerciseSchema.parse(initial).pauseVisibility, undefined);
});
