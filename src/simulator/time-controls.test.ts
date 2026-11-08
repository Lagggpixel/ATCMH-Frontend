import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {advance, applyEnvelope, initialExercise, predictAircraft} from "./engine";
import {envelopeSchema, menteeActionAllowed} from "./protocol";
import {recordedStateAt, replayDelta, replayState} from "./replays";
import {rewindScenario} from "./scenario-engine";
import type {Action, Exercise} from "./model";
import type {ScenarioRuntime} from "./scenarios";

const send = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: randomUUID(), time: 0, action});
  assert.equal(result.error, undefined);
  return result.state;
};
const running = () => send(initialExercise("time"), {kind: "play"});

test("trainers set the simulation speed; the setting is staff-only and survives the session schema", () => {
  let state = send(running(), {kind: "time-scale", scale: 4});
  assert.equal(state.timeScale, 4);
  state = send(state, {kind: "time-scale", scale: 1});
  assert.equal(state.timeScale, undefined);
  for (const action of [{kind: "time-scale", scale: 2}, {kind: "rewind", seconds: 60}] as const) {
    assert.ok(envelopeSchema.safeParse({id: "a", time: 1, action}).success);
    assert.equal(menteeActionAllowed(action), false);
  }
  assert.ok(!envelopeSchema.safeParse({id: "a", time: 1, action: {kind: "time-scale", scale: 3}}).success);
  // Rewinding needs the live session's recording, so the engine alone refuses it.
  assert.ok(applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "rewind", seconds: 30}}).error);
});

test("a frozen aircraft holds its position and altitude while other traffic keeps moving", () => {
  let state = send(running(), {kind: "edit", aircraftId: "demo-air", patch: {frozen: true}});
  const before = structuredClone(state.aircraft[0]), other = structuredClone(state.aircraft.find(a => a.id !== "demo-air" && a.speed > 0) ?? state.aircraft[0]);
  state = advance(state, 5);
  assert.deepEqual(state.aircraft[0].position, before.position);
  assert.equal(state.aircraft[0].altitude, before.altitude);
  assert.deepEqual(predictAircraft(state.aircraft, 1)[0].position, before.position);
  if (other.id !== "demo-air") assert.notDeepEqual(state.aircraft.find(a => a.id === other.id)!.position, other.position);
  state = send(state, {kind: "edit", aircraftId: "demo-air", patch: {frozen: false}});
  assert.notDeepEqual(advance(state, 2).aircraft[0].position, before.position);
});

test("the recording reads back the latest state at a time, following an earlier rewind", () => {
  const initial = replayState(running());
  const states: Exercise[] = [initial];
  let state = initial;
  for (let i = 0; i < 6; i++) {state = advance(state, 5); states.push(replayState(state));}
  // A rewind to 10 s and a different branch from there.
  const branch = [states[2]];
  state = send(states[2], {kind: "edit", aircraftId: "demo-air", patch: {color: "#ff8800"}});
  for (let i = 0; i < 2; i++) {state = advance(state, 5); branch.push(replayState(state));}
  const sequence = [...states, ...branch];
  const deltas = sequence.slice(1).map((after, index) => replayDelta(sequence[index], after));
  assert.equal(Math.round(recordedStateAt(initial, deltas, 7)!.elapsed), 5);
  const latest = recordedStateAt(initial, deltas, 17)!;
  assert.equal(Math.round(latest.elapsed), 15);
  assert.equal(latest.aircraft[0].color, "#ff8800", "the state comes from the branch after the rewind");
  assert.equal(recordedStateAt({...initial, elapsed: 20}, [], 10), null);
});

test("rewinding a scenario lets events that ran after that moment run again", () => {
  const runtime = {generation: "0", events: {early: {status: "completed", completedAt: 5}, late: {status: "completed", completedAt: 40}, delayed: {status: "waiting", conditionAt: 35}, held: {status: "waiting", conditionAt: 10}}} as unknown as ScenarioRuntime;
  const processed = rewindScenario(runtime, 30, ["0:early:0", "0:late:0", "0:late:1", "client-command", "0:delayed:0"]);
  assert.deepEqual(processed, ["0:early:0", "client-command", "0:delayed:0"], "only the rearmed events' actions may run again");
  assert.deepEqual(runtime.events, {early: {status: "completed", completedAt: 5}, late: {status: "scheduled"}, delayed: {status: "waiting"}, held: {status: "waiting", conditionAt: 10}});
});
