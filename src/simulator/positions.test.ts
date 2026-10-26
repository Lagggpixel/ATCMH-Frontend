import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {facilities, freshFacilityEnvironment} from "./aviation";
import {getAirport, frequenciesFor} from "./airports";
import {advance, applyEnvelope, autoReadbacks, engineFor} from "./engine";
import {exerciseSchema, controllerPositionsSchema} from "./protocol";
import {aircraftPosition, ownsAircraft, type ControllerPosition} from "./positions";
import {applyReplayDelta, replayDelta, replayState, participantReplay} from "./replays";
import {blankScenario, createScenarioExercise, scenarioSchema, seedFromAircraft} from "./scenarios";
import {advanceScenario} from "./scenario-engine";
import {referenceMenu} from "./reference-menu";
import type {Action, Exercise, Instruction} from "./model";

const selection = {airport: "LGAV", trainingStation: "LGAV:approach"};
export const approachPositions = (): ControllerPosition[] => facilities.filter(f => f.airport === "LGAV" && f.type === "approach").slice(0, 3).map((f, i) => ({id: `approach-${i + 1}`, name: ["Initial", "Final", "South"][i], service: "approach", facilityId: f.id, mhz: f.mhz}));
export function splitExercise(): Exercise {
  const exercise = engineFor(selection).initialExercise(randomUUID());
  exercise.positions = approachPositions(); exercise.aircraft[0].positionId = exercise.positions[0].id;
  exercise.running = true; return exercise;
}
const apply = (exercise: Exercise, action: Action) => {
  const result = applyEnvelope(exercise, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
};
export const transfer = (exercise: Exercise, target = exercise.positions![1]): Instruction => ({type: "frequency", frequency: "approach", targetPositionId: target.id, facilityId: target.facilityId, facilityName: target.name, mhz: target.mhz});

test("fresh environments activate only the primary channel of each selected service", () => {
  for (const mode of ["local", "approach", "center"] as const) {
    const airport = getAirport(selection), env = freshFacilityEnvironment(airport, mode, engineFor(selection).initialExercise().radarEnvironment!);
    for (const service of mode === "local" ? ["ground", "tower"] : mode === "approach" ? ["approach"] : []) {
      const channels = facilities.filter(f => f.airport === airport.icao && f.type === service);
      assert.equal(channels.filter(f => env.facilityActivity?.[f.id]).length, 1);
      assert.equal(env.facilityActivity?.[channels[0].id], true);
      assert.equal(frequenciesFor(airport)[service as "approach"].value, channels[0].mhz);
    }
  }
});
test("explicit activity overrides survive fresh environment initialization", () => {
  const p = approachPositions(), base = engineFor(selection).initialExercise().radarEnvironment!;
  const env = freshFacilityEnvironment(getAirport(selection), "approach", {...base, facilityActivity: {[p[0].facilityId]: false, [p[1].facilityId]: true}});
  assert.equal(env.facilityActivity?.[p[0].facilityId], false); assert.equal(env.facilityActivity?.[p[1].facilityId], true);
});
test("positions require unique identities and distinct channels", () => {
  const p = approachPositions(); assert.ok(controllerPositionsSchema.safeParse(p).success);
  for (const id of ["__proto__", "constructor", "prototype"]) assert.equal(controllerPositionsSchema.safeParse([{...p[0], id}]).success, false);
  for (const field of ["id", "facilityId", "mhz"] as const) assert.equal(controllerPositionsSchema.safeParse([p[0], {...p[1], [field]: p[0][field]}]).success, false);
});
test("ownership uses position IDs and legacy Approach traffic defaults to the first position", () => {
  const state = splitExercise(), a = state.aircraft[0];
  assert.ok(ownsAircraft(state, a, state.positions![0].id)); assert.equal(ownsAircraft(state, a, state.positions![1].id), false);
  delete a.positionId; assert.equal(aircraftPosition(state, a), state.positions![0].id);
});
test("internal transfer changes ownership only on readback, preserving radar guidance and source-channel readback", () => {
  let state = splitExercise(); const original = structuredClone(state.aircraft[0]);
  state = apply(state, {kind: "command", aircraftId: original.id, command: transfer(state), frequency: "approach", text: "Contact Final"});
  const command = state.messages.at(-1)!;
  assert.equal(state.aircraft[0].positionId, state.positions![0].id);
  state = apply(state, {kind: "pilot", aircraftId: original.id, replyTo: command.id, assign: true, text: "Contacting Final"});
  const a = state.aircraft[0];
  assert.equal(a.positionId, state.positions![1].id); assert.equal(a.frequency, "approach"); assert.equal(a.radar!.transferred, false);
  assert.equal(a.radar!.report, "check-in"); assert.equal(a.heading, original.heading); assert.equal(a.targetHeading, original.targetHeading);
  assert.equal(a.altitude, original.altitude); assert.equal(a.targetSpeed, original.targetSpeed); assert.deepEqual(a.flightPlan, original.flightPlan);
  assert.equal(state.messages.at(-1)!.positionId, state.positions![0].id);
  state = autoReadbacks(state, 1000, randomUUID);
  assert.ok(state.messages.some(m => m.sender === "pilot" && !m.commandId && m.positionId === state.positions![1].id));
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action: {kind: "command", aircraftId: a.id, command: {type: "vector", heading: 180}, frequency: "approach", text: "Fly 180"}});
  assert.equal(result.error, undefined);
});
test("automatic readbacks perform the same internal transfer", () => {
  let state = splitExercise(); const id = state.aircraft[0].id;
  state = apply(state, {kind: "command", aircraftId: id, command: transfer(state), frequency: "approach", text: "Contact Final"});
  state = autoReadbacks(advance(state, 2), 2000, randomUUID);
  assert.equal(state.aircraft[0].positionId, state.positions![1].id); assert.equal(state.aircraft[0].radar!.transferred, false);
});
test("invalid or same-position handoff targets cannot bypass command validation", () => {
  const state = splitExercise(), id = state.aircraft[0].id;
  for (const command of [transfer(state, state.positions![0]), {...transfer(state), targetPositionId: "unknown"}, {...transfer(state), mhz: "123.45"}]) {
    assert.ok(applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: id, command, frequency: "approach", text: "Contact"}}).error);
  }
});
test("handoff menu offers connected other positions with their specific channels", () => {
  const state = splitExercise(), positions = state.positions!.map((p, i) => ({...p, occupied: i !== 2, traineeName: `Trainee ${i}`}));
  const menu = referenceMenu("approach", state.aircraft[0], getAirport(state), {...state.radarEnvironment!, controllerPositions: positions}, [], state.aircraft);
  const contacts = menu.find(m => m.label === "Contact Other Frequency")!.children!;
  assert.ok(contacts.some(c => c.instruction?.type === "frequency" && c.instruction.targetPositionId === positions[1].id));
  assert.ok(!contacts.some(c => c.instruction?.type === "frequency" && c.instruction.targetPositionId === positions[0].id));
  assert.ok(!contacts.some(c => c.instruction?.type === "frequency" && c.instruction.targetPositionId === positions[2].id));
});
test("scenario positions, scheduled starting ownership and check-in triggers round trip", () => {
  const state = splitExercise(), definition = {...blankScenario(selection), positions: state.positions, aircraft: [{key: "arrival", initial: true, seed: seedFromAircraft(state.aircraft[0])}], events: [{id: "final-contact", title: "Final contact", trigger: {type: "condition" as const, condition: {type: "controller-position" as const, aircraftKey: "arrival", positionId: state.positions![1].id}, delay: 0}, actions: [{type: "note" as const, text: "Final owns the arrival"}]}]};
  const parsed = scenarioSchema.parse(definition), {exercise, runtime} = createScenarioExercise(parsed, randomUUID(), randomUUID());
  assert.equal(exercise.aircraft[0].positionId, state.positions![0].id);
  let next = apply({...exercise, running: true}, {kind: "command", aircraftId: exercise.aircraft[0].id, command: transfer(exercise), frequency: "approach", text: "Contact Final"});
  const command = next.messages.at(-1)!; next = apply(next, {kind: "pilot", aircraftId: exercise.aircraft[0].id, replyTo: command.id, assign: true, text: "Contacting Final"});
  advanceScenario(next, runtime, 0, 0); assert.notEqual(runtime.events["final-contact"].status, "completed");
  next = autoReadbacks(next, 1000, randomUUID); advanceScenario(next, runtime, 0, 1000);
  assert.equal(runtime.events["final-contact"].status, "completed");
  const scheduled = {...parsed, aircraft: [{...parsed.aircraft[0], initial: false, seed: {...parsed.aircraft[0].seed, positionId: parsed.positions![2].id}}], events: [{id: "spawn", title: "Spawn South", trigger: {type: "time" as const, at: 0}, actions: [{type: "spawn" as const, aircraftKey: "arrival"}]}]};
  const started = createScenarioExercise(scheduled, randomUUID(), randomUUID());
  assert.equal(advanceScenario({...started.exercise, running: true}, started.runtime, 0, 0).exercise.aircraft[0].positionId, parsed.positions![2].id);
});
test("replay deltas retain layout, position ownership, attribution and position feedback", () => {
  const before = splitExercise(), after = structuredClone(before); after.aircraft[0].positionId = after.positions![1].id;
  after.positionFeedback = {[after.positions![1].id]: "Good coordination"}; after.messages.push({id: randomUUID(), aircraftId: after.aircraft[0].id, time: 0, frequency: "approach", positionId: after.positions![0].id, actorId: "trainer", actorName: "Trainer", sender: "controller", text: "Contact Final"});
  assert.deepEqual(exerciseSchema.parse(applyReplayDelta(before, replayDelta(before, after))), exerciseSchema.parse(after));
  assert.equal(replayState({...after, positionPresence: after.positions!.map(p => ({...p, occupied: true}))}).positionPresence, undefined);
});


test("personal feedback is filtered from both initial replay state and later deltas", () => {
  const initial = splitExercise(); initial.positionFeedback = {"approach-1": "Alpha feedback", "approach-2": "Bravo feedback"};
  const filtered = participantReplay({replay: {participants: [{role: "mentee", accountId: "alpha", positionId: "approach-1"}]} as never, initial,
    frames: [{sequence: 1, at: 1, interpolate: false, delta: {state: {positionFeedback: initial.positionFeedback}, aircraft: []}}], next: null}, "alpha");
  assert.deepEqual(filtered.initial!.positionFeedback, {"approach-1": "Alpha feedback"});
  assert.deepEqual(filtered.frames[0].delta.state.positionFeedback, {"approach-1": "Alpha feedback"});
  assert.equal(initial.positionFeedback["approach-2"], "Bravo feedback", "stored replay is unchanged");
});
