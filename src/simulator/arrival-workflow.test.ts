import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {arrivalWorkflow} from "./arrival-workflow";
import {instructionText, messageMenu} from "./catalog";
import {applyEnvelope, initialExercise, newAircraft, runwayGeometry} from "./engine";
import type {Action, Exercise, Instruction} from "./model";
import {exerciseSchema} from "./protocol";

function act(state: Exercise, action: Action) {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
}
function send(state: Exercise, command: Instruction) {
  return act(state, {kind: "command", aircraftId: "demo-air", command, frequency: "tower", text: instructionText(state.aircraft[0], command)});
}
function start(option = false, queued = false) {
  let state = initialExercise();
  state.aircraft[0].callsign = "Speedbird 1";
  if (queued) {
    const leader = newAircraft("leader", true); leader.position = runwayGeometry().threshold;
    state.aircraft.push(leader);
  }
  state = act(state, {kind: "pilot", aircraftId: "demo-air", text: "", request: {id: option ? "inbound-option" : "inbound-land", runway: "24"}});
  return state;
}
const entry: Instruction = {type: "pattern", hand: "left", leg: "downwind", runway: "24"};
const sequence: Instruction = {type: "sequence", number: 2, traffic: "Final"};
const status = (state: Exercise) => arrivalWorkflow(state, state.aircraft[0])!;

test("both arrival requests expect entry, skip standalone sequencing when first, then their matching clearance", () => {
  for (const option of [false, true]) {
    let state = start(option);
    assert.deepEqual(status(state), {runway: "24", option, entry: false, sequenceRequired: false, sequence: false, clearance: false});
    state = send(state, entry);
    assert.equal(state.messages.at(-1)!.text, "Speedbird 1, enter left downwind runway 24");
    assert.equal(status(state).entry, true);
    state = send(state, {type: "land", option, runway: "24", number: 1});
    assert.equal(status(state).clearance, true);
    assert.deepEqual(status(exerciseSchema.parse(state)), status(state), "request identity survives saved snapshots");
  }
});

test("arrivals behind traffic require sequencing after entry and before clearance", () => {
  for (const option of [false, true]) {
    let state = start(option, true);
    assert.equal(status(state).sequenceRequired, true);
    state = send(state, entry);
    state = send(state, {type: "land", option, runway: "24", number: 2});
    assert.equal(status(state).clearance, false, "early clearance cannot complete the ordered exchange");
    state = send(state, sequence);
    assert.equal(status(state).sequence, true); assert.equal(status(state).clearance, false);
    state = send(state, {type: "land", option, runway: "24", number: 2});
    assert.equal(status(state).clearance, true);
  }
});

test("entry with combined sequencing satisfies both stages, and cancelled clearance needs reissuing", () => {
  let state = start(true, true);
  state = send(state, {...entry, sequence: {number: 2, traffic: "Final"}});
  assert.equal(status(state).entry, true); assert.equal(status(state).sequence, true);
  state = send(state, {type: "land", runway: "24", option: true, number: 2});
  assert.equal(status(state).clearance, true);
  state = send(state, {type: "cancel-landing"});
  assert.equal(status(state).clearance, false);
});

test("wrong runway/type, out-of-order, withdrawn and unable replies do not complete mentor expectations", () => {
  let state = start(true, true);
  state = send(state, sequence);
  state = send(state, {type: "land", option: true, runway: "24"});
  assert.equal(status(state).entry, false); assert.equal(status(state).sequence, false);
  state = send(state, {...entry, runway: "06"});
  assert.equal(status(state).entry, false);
  state = send(state, entry);
  state = act(state, {kind: "pilot", aircraftId: "demo-air", text: "Unable, Speedbird 1", replyTo: state.messages.at(-1)!.id});
  assert.equal(status(state).entry, false);
  state = send(state, entry);
  state = send(state, {type: "radio", message: "disregard"});
  assert.equal(status(state).entry, false);
  state = send(state, entry); state = send(state, sequence);
  state = send(state, {type: "land", option: false, runway: "24"});
  assert.equal(status(state).clearance, false);
});

test("a new request resets expectations, and a new circuit cannot inherit arrival progress", () => {
  let state = send(start(), entry);
  state = act(state, {kind: "pilot", aircraftId: "demo-air", text: "", request: {id: "inbound-option", runway: "24"}});
  assert.equal(status(state).entry, false); assert.equal(status(state).option, true);
  state.aircraft[0].circuit = 1;
  assert.equal(arrivalWorkflow(state, state.aircraft[0]), null);
});

test("arrival requests never tailor the trainee menu or block a prematurely issued clearance", () => {
  const before = initialExercise(), state = start(false, true);
  assert.deepEqual(messageMenu("tower", state.aircraft[0]), messageMenu("tower", before.aircraft[0]));
  const next = send(state, {type: "land", runway: "24", number: 1});
  assert.equal(next.messages.at(-1)!.instruction?.type, "land");
  assert.equal(status(next).clearance, false);
  assert.ok(!("arrivalWorkflow" in next), "derived mentor expectations are not put in shared snapshots");
});
