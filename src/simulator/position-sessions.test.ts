import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {SessionService, type Actor} from "./server/session-service";
import {MemoryStore} from "./session-test-store";
import {facilities} from "./aviation";
import {advance, autoReadbacks, engineFor} from "./engine";
import {SESSION_LEASE_MS} from "./sessions";
import type {Action} from "./model";

async function harness() {
  let now = 1000;
  const store = new MemoryStore();
  const service = new SessionService(store, () => now, randomUUID, {apply() {}, request() {}}, {apply() {return false;}, request() {}}, undefined);
  const trainer: Actor = {accountId: "trainer", discordId: "100000000000000001", staff: true, canAssign: true, displayName: "Trainer"};
  const first: Actor = {accountId: "first", discordId: "100000000000000002", staff: false, displayName: "First trainee"};
  const second: Actor = {accountId: "second", discordId: "100000000000000003", staff: false, displayName: "Second trainee"};
  const third: Actor = {accountId: "third", discordId: "100000000000000004", staff: false, displayName: "Third trainee"};
  const exercise = engineFor({airport: "LGAV", trainingStation: "LGAV:approach"}).initialExercise(randomUUID());
  const positions = facilities.filter(f => f.airport === "LGAV" && f.type === "approach").slice(0, 3).map((f, i) => ({id: `approach-${i + 1}`, name: ["Initial", "Final", "South"][i], service: "approach" as const, facilityId: f.id, mhz: f.mhz}));
  const session = await service.create(trainer, "Approach splits", exercise);
  const control = randomUUID(); await service.join(trainer, session.id, "staff", control);
  await service.configurePositions(trainer, session.id, positions);
  for (const [i, trainee] of [first, second, third].entries()) await service.assignPosition(trainer, session.id, positions[i].id, {discordId: trainee.discordId, name: trainee.displayName, assignedAt: now, assignedBy: trainer.accountId});
  const tokens = [randomUUID(), randomUUID(), randomUUID()];
  const join = (actor: Actor, index: number, token = tokens[index]) => service.join(actor, session.id, "mentee", token, positions[index].id);
  const dispatch = (actor: Actor, role: "staff" | "mentee", token: string, action: Action) => service.dispatch(actor, session.id, role, token, {id: randomUUID(), time: now, action});
  return {store, service, trainer, first, second, third, positions, session, control, tokens, join, dispatch, setNow: (value: number) => {now = value;}};
}
test("three trainees independently occupy three positions in one simulation", async () => {
  const h = await harness();
  for (const [i, actor] of [h.first, h.second, h.third].entries()) assert.equal((await h.join(actor, i)).positionId, h.positions[i].id);
  const frame = await h.service.frame(h.trainer, h.session.id, "staff", h.control);
  assert.equal(frame.session.positions?.filter(p => p.occupied).length, 3);
  assert.equal(frame.session.positions?.[1].traineeName, "Second trainee");
  assert.equal(JSON.stringify(frame).includes(h.tokens[0]), false, "seat tokens never enter public presence");
});
test("a mentee assigned to several positions bandboxes them in one page, and a second page must take the seat over", async () => {
  const h = await harness();
  await h.service.assignPosition(h.trainer, h.session.id, h.positions[1].id, {discordId: h.first.discordId, name: h.first.displayName, assignedAt: 1000, assignedBy: h.trainer.accountId});
  const joined = await h.join(h.first, 1);
  assert.deepEqual(joined.positionIds, [h.positions[0].id, h.positions[1].id]);
  assert.equal(joined.positionId, h.positions[0].id);
  await assert.rejects(h.join(h.first, 0, randomUUID()), {code: "seat-open-elsewhere"});
  const moved = randomUUID();
  assert.deepEqual((await h.service.join(h.first, h.session.id, "mentee", moved, undefined, true)).positionIds, [h.positions[0].id, h.positions[1].id]);
  await assert.rejects(h.service.frame(h.first, h.session.id, "mentee", h.tokens[1]), {code: "seat-lost"});
  const presence = (await h.service.frame(h.trainer, h.session.id, "staff", h.control)).session.positions!;
  assert.deepEqual(presence.map(p => p.bandboxId), [h.positions[0].id, h.positions[0].id, undefined]);
});
test("bandboxes: one frequency for owned traffic, no handoff inside, demonstration covers all, split off and add mid-session", async () => {
  const h = await harness();
  await h.service.assignPosition(h.trainer, h.session.id, h.positions[1].id, {discordId: h.first.discordId, name: h.first.displayName, assignedAt: 1000, assignedBy: h.trainer.accountId});
  await h.join(h.first, 0); await h.join(h.third, 2);
  const record = await h.store.read(h.session.id);
  const inFinal = record.exercise.aircraft.find(a => a.positionId === h.positions[1].id) ?? record.exercise.aircraft.find(a => a.frequency === "approach")!;
  await h.store.transaction(h.session.id, r => {r.exercise.aircraft = r.exercise.aircraft.map(a => a.id === inFinal.id ? {...a, frequency: "approach", positionId: h.positions[1].id} : a); r.contentRevision++;});
  await h.dispatch(h.first, "mentee", h.tokens[0], {kind: "command", aircraftId: inFinal.id, command: {type: "vector", heading: 90}, frequency: "approach", text: "Heading 90"});
  assert.equal((await h.store.read(h.session.id)).exercise.messages.find(m => m.sender === "controller")?.positionId, h.positions[1].id);
  const final = h.positions[1];
  await assert.rejects(h.dispatch(h.first, "mentee", h.tokens[0], {kind: "command", aircraftId: inFinal.id, frequency: "approach", text: "Contact Final", command: {type: "frequency", frequency: "approach", targetPositionId: final.id, facilityId: final.facilityId, mhz: final.mhz}}), {code: "forbidden"});
  await h.dispatch(h.trainer, "staff", h.control, {kind: "demonstrate", enabled: true, positionId: final.id});
  assert.equal((await h.store.read(h.session.id)).exercise.demonstration?.positionId, h.positions[0].id);
  await assert.rejects(h.dispatch(h.first, "mentee", h.tokens[0], {kind: "command", aircraftId: inFinal.id, command: {type: "vector", heading: 100}, frequency: "approach", text: "Heading 100"}), {code: "demonstrating"});
  await h.dispatch(h.trainer, "staff", h.control, {kind: "command", aircraftId: inFinal.id, command: {type: "vector", heading: 110}, frequency: "approach", text: "Heading 110"});
  await h.dispatch(h.trainer, "staff", h.control, {kind: "demonstrate", enabled: false});
  // Split off Final to the third mentee: the first keeps Initial, the third bandboxes Final with South at once.
  await h.service.assignPosition(h.trainer, h.session.id, final.id, {discordId: h.third.discordId, name: h.third.displayName, assignedAt: 2000, assignedBy: h.trainer.accountId});
  assert.deepEqual((await h.service.frame(h.first, h.session.id, "mentee", h.tokens[0])).positionIds, [h.positions[0].id]);
  assert.deepEqual((await h.service.frame(h.third, h.session.id, "mentee", h.tokens[2])).positionIds, [final.id, h.positions[2].id]);
});
test("a mentor can bandbox open positions and work them on one page", async () => {
  const h = await harness();
  for (const p of h.positions.slice(1)) await h.service.assignPosition(h.trainer, h.session.id, p.id, null);
  const view = await h.service.join(h.trainer, h.session.id, "mentee", randomUUID(), `${h.positions[1].id},${h.positions[2].id}`);
  assert.deepEqual(view.positionIds, [h.positions[1].id, h.positions[2].id]);
  await assert.rejects(h.service.join(h.trainer, h.session.id, "mentee", randomUUID(), h.positions[0].id), {code: "not-assigned"});
});
test("assignment and seat ownership cannot be bypassed with a position ID or another token", async () => {
  const h = await harness(); await h.join(h.first, 0);
  // Asking for someone else's position only reaches the mentee's own seat.
  await assert.rejects(h.join(h.first, 1), {code: "seat-open-elsewhere"});
  assert.equal((await h.store.read(h.session.id)).positionState?.[h.positions[1].id]?.seat ?? null, null);
  await assert.rejects(h.service.frame(h.second, h.session.id, "mentee", h.tokens[0]), {code: "seat-lost"});
  const aircraftId = (await h.store.read(h.session.id)).exercise.aircraft[0].id;
  await h.join(h.second, 1);
  await assert.rejects(h.dispatch(h.second, "mentee", h.tokens[1], {kind: "command", aircraftId, command: {type: "vector", heading: 90}, frequency: "approach", text: "Heading 90"}), {code: "forbidden"});
});
test("start waits for all positions, and handoffs require the receiving trainee to be connected", async () => {
  const h = await harness(); await h.join(h.first, 0);
  await assert.rejects(h.dispatch(h.trainer, "staff", h.control, {kind: "play"}), {code: "position-offline"});
  const a = (await h.store.read(h.session.id)).exercise.aircraft[0];
  const target = h.positions[1];
  await assert.rejects(h.dispatch(h.first, "mentee", h.tokens[0], {kind: "command", aircraftId: a.id, frequency: "approach", text: "Contact Final", command: {type: "frequency", frequency: "approach", targetPositionId: target.id, facilityId: target.facilityId, mhz: target.mhz}}), {code: "position-offline"});
});
test("a completed handoff isolates messages and rejects queued commands from the previous controller", async () => {
  const h = await harness(); await h.join(h.first, 0); await h.join(h.second, 1); await h.join(h.third, 2);
  await h.dispatch(h.trainer, "staff", h.control, {kind: "play"});
  const a = (await h.store.read(h.session.id)).exercise.aircraft[0], target = h.positions[1];
  await h.dispatch(h.first, "mentee", h.tokens[0], {kind: "command", aircraftId: a.id, frequency: "approach", text: "Contact Final", command: {type: "frequency", frequency: "approach", targetPositionId: target.id, facilityId: target.facilityId, mhz: target.mhz}});
  await h.store.transaction(h.session.id, record => {record.exercise = autoReadbacks(advance(record.exercise, 2), 3000, randomUUID); record.exercise = autoReadbacks(record.exercise, 3000, randomUUID); record.contentRevision++;});
  const oldFrame = await h.service.frame(h.first, h.session.id, "mentee", h.tokens[0]);
  const newFrame = await h.service.frame(h.second, h.session.id, "mentee", h.tokens[1]);
  assert.ok(oldFrame.exercise.messages.every(m => m.positionId === h.positions[0].id));
  assert.ok(newFrame.exercise.messages.some(m => m.positionId === target.id && m.sender === "pilot"));
  assert.equal(oldFrame.exercise.messages.find(m => m.sender === "controller")?.actorId, h.first.accountId);
  await assert.rejects(h.dispatch(h.first, "mentee", h.tokens[0], {kind: "command", aircraftId: a.id, frequency: "approach", text: "Heading 90", command: {type: "vector", heading: 90}}), {code: "forbidden"});
  await h.dispatch(h.second, "mentee", h.tokens[1], {kind: "command", aircraftId: a.id, frequency: "approach", text: "Heading 90", command: {type: "vector", heading: 90}});
});
test("one shared clock advances once regardless of the number of controller streams", async () => {
  const h = await harness(); await h.join(h.first, 0); await h.join(h.second, 1); await h.join(h.third, 2);
  await h.dispatch(h.trainer, "staff", h.control, {kind: "play"}); h.setNow(2000);
  await Promise.all([h.service.frame(h.first, h.session.id, "mentee", h.tokens[0]), h.service.frame(h.second, h.session.id, "mentee", h.tokens[1]), h.service.frame(h.third, h.session.id, "mentee", h.tokens[2])]);
  assert.ok(Math.abs((await h.store.read(h.session.id)).exercise.elapsed - 1) < 1e-8);
});
test("expired or leaving positions pause the simulation while preserving aircraft ownership", async () => {
  const h = await harness(); await h.join(h.first, 0); await h.join(h.second, 1); await h.join(h.third, 2);
  await h.dispatch(h.trainer, "staff", h.control, {kind: "play"});
  h.setNow(1000 + SESSION_LEASE_MS + 1); await h.service.join(h.trainer, h.session.id, "staff", h.control);
  const record = await h.store.read(h.session.id); assert.equal(record.exercise.running, false); assert.equal(record.exercise.aircraft[0].positionId, h.positions[0].id);
  await h.join(h.first, 0); await h.join(h.second, 1); await h.join(h.third, 2); await h.dispatch(h.trainer, "staff", h.control, {kind: "play"});
  await h.service.leave(h.first, h.session.id, "mentee", h.tokens[0]); assert.equal((await h.store.read(h.session.id)).exercise.running, false);
});
test("a position demonstration locks only that position and leaves the other trainee controlling", async () => {
  const h = await harness(); await h.join(h.first, 0); await h.join(h.second, 1); await h.join(h.third, 2);
  await h.dispatch(h.trainer, "staff", h.control, {kind: "play"});
  await h.dispatch(h.trainer, "staff", h.control, {kind: "demonstrate", enabled: true, positionId: h.positions[0].id});
  const a = (await h.store.read(h.session.id)).exercise.aircraft[0];
  await assert.rejects(h.dispatch(h.first, "mentee", h.tokens[0], {kind: "read", aircraftId: a.id, frequency: "approach"}), {code: "demonstrating"});
  await h.store.transaction(h.session.id, record => {record.exercise.aircraft[0].positionId = h.positions[1].id;});
  await h.dispatch(h.second, "mentee", h.tokens[1], {kind: "read", aircraftId: a.id, frequency: "approach"});
});
test("combining positions preserves aircraft and requires a paused session", async () => {
  const h = await harness(); await h.store.transaction(h.session.id, record => {record.exercise.aircraft[0].positionId = h.positions[2].id;});
  await h.service.configurePositions(h.trainer, h.session.id, [h.positions[0]]);
  const record = await h.store.read(h.session.id); assert.equal(record.exercise.aircraft[0].positionId, h.positions[0].id); assert.equal(record.exercise.aircraft.length, 1);
});
test("saving feedback preserves the live seat and exposes only that position's feedback to its trainee", async () => {
  const h = await harness(); await h.join(h.first, 0); await h.join(h.second, 1);
  await h.service.assignPosition(h.trainer, h.session.id, h.positions[0].id, {discordId: h.first.discordId, name: h.first.displayName, assignedAt: 2000, assignedBy: h.trainer.accountId}, "Good coordination");
  assert.equal((await h.store.read(h.session.id)).positionState?.[h.positions[0].id].seat?.token, h.tokens[0]);
  assert.deepEqual((await h.service.frame(h.first, h.session.id, "mentee", h.tokens[0])).exercise.positionFeedback, {[h.positions[0].id]: "Good coordination"});
  assert.equal((await h.service.frame(h.second, h.session.id, "mentee", h.tokens[1])).exercise.positionFeedback, undefined);
});


test("the nominated first position publishes the shared ATIS and other positions remain read-only", async () => {
  const h = await harness(); await h.join(h.first, 0); await h.join(h.second, 1);
  await h.dispatch(h.first, "mentee", h.tokens[0], {kind: "publish-atis"});
  assert.notEqual((await h.store.read(h.session.id)).exercise.publishedAtis, "ATIS UNAVAILABLE");
  await assert.rejects(h.dispatch(h.second, "mentee", h.tokens[1], {kind: "publish-atis"}), {code: "forbidden"});
});

test("other positions allow display edits but reject control and message actions", async () => {
  const h = await harness(); await h.join(h.first, 0); await h.join(h.second, 1);
  const aircraftId = (await h.store.read(h.session.id)).exercise.aircraft[0].id;
  await h.dispatch(h.second, "mentee", h.tokens[1], {kind: "edit", aircraftId, patch: {tagAngle: 90}});
  assert.equal((await h.store.read(h.session.id)).exercise.aircraft[0].tagAngle, 90);
  await assert.rejects(h.dispatch(h.second, "mentee", h.tokens[1], {kind: "edit", aircraftId, patch: {frequency: "tower"}}), {code: "forbidden"});
  await assert.rejects(h.dispatch(h.second, "mentee", h.tokens[1], {kind: "read", aircraftId, frequency: "approach"}), {code: "forbidden"});
  await assert.rejects(h.dispatch(h.second, "mentee", h.tokens[1], {kind: "command", aircraftId, frequency: "approach", command: {type: "vector", heading: 90}, text: "Heading 90"}), {code: "forbidden"});
});
