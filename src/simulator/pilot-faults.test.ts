import {withFixedReadbackDelay} from "./test-exercise";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {advance, applyEnvelope, autoReadbacks, initialExercise, wrongReadbackText} from "./engine";
import {catalogFor} from "./catalog";
import {frequenciesFor, getAirport} from "./airports";
import {climbRate} from "./aircraft-performance";
import {pendingPilotMessage, pendingRequestCount, pilotAutomatic, type Action, type Exercise} from "./model";
import {envelopeSchema, menteeActionAllowed} from "./protocol";

const send = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: randomUUID(), time: 0, action});
  assert.equal(result.error, undefined);
  return result.state;
};
const automatic = () => send({...withFixedReadbackDelay(initialExercise("faults")), running: true}, {kind: "auto-readback", enabled: true});
const clearToLand = (state: Exercise) => send(state, {kind: "command", aircraftId: "demo-air", frequency: "tower", text: "cleared to land", command: {type: "land", runway: "24", number: 1}});
const replies = (state: Exercise) => state.messages.filter(m => m.sender === "pilot" && m.commandId !== undefined);

test("wrong readbacks change one value and never the callsign", () => {
  assert.equal(wrongReadbackText("Number 1, cleared to land, runway 24, Speedbird 124", "Speedbird 124"), "Number 1, cleared to land, runway 06, Speedbird 124");
  assert.equal(wrongReadbackText("Climb and maintain 5000, Easy 24", "Easy 24"), "Climb and maintain 4000, Easy 24");
  assert.equal(wrongReadbackText("Turn left heading 350, Easy 24", "Easy 24"), "Turn left heading 010, Easy 24");
  assert.equal(wrongReadbackText("Wilco, Easy 24", "Easy 24"), undefined);
});

test("an armed wrong readback is heard once, and the pilot does not act on it until corrected", () => {
  let state = send(automatic(), {kind: "edit", aircraftId: "demo-air", patch: {pilotFault: {wrongReadback: true}}});
  state = clearToLand(state);
  state = autoReadbacks(advance(state, 2), 2000, randomUUID);
  const reply = replies(state).at(-1)!;
  assert.match(reply.text, /runway 06/);
  assert.equal(state.aircraft[0].clearedToLand, false, "a garbled readback is not a clearance the pilot follows");
  assert.equal(state.aircraft[0].pilotFault?.wrongReadback, undefined, "the fault is used up");
  // The trainee catches it and says it again; this time the readback is correct.
  state = clearToLand(state);
  state = autoReadbacks(advance(state, 2), 4000, randomUUID);
  assert.match(replies(state).at(-1)!.text, /runway 24/);
  assert.equal(state.aircraft[0].clearedToLand, true);
});

test("a radio failure silences readbacks and calls until the trainer restores it", () => {
  let state = send(automatic(), {kind: "edit", aircraftId: "demo-air", patch: {pilotFault: {radioFailure: true}}});
  assert.equal(pilotAutomatic(state, state.aircraft[0]), false);
  state = clearToLand(state);
  assert.equal(state.messages.at(-1)!.autoReadbackAt, undefined);
  state = autoReadbacks(advance(state, 2), 2000, randomUUID);
  assert.equal(replies(state).length, 0);
  assert.equal(state.aircraft[0].clearedToLand, false);
  state = send(state, {kind: "edit", aircraftId: "demo-air", patch: {pilotFault: {}}});
  state = clearToLand(state);
  state = autoReadbacks(advance(state, 2), 4000, randomUUID);
  assert.equal(replies(state).length, 1);
});

test("trainers can declare a medical emergency or engine failure, and an engine failure halves the climb", () => {
  const state = automatic(), air = state.aircraft[0];
  const requests = catalogFor(getAirport(state)).pilotRequests(air).map(r => r.id);
  assert.ok(requests.includes("medical-emergency")); assert.ok(requests.includes("engine-failure"));
  const before = climbRate(air);
  const next = send(state, {kind: "pilot", aircraftId: air.id, text: "", request: {id: "engine-failure", runway: "24"}});
  assert.match(next.messages.at(-1)!.text, /^Mayday, mayday, mayday, .*engine failure/);
  assert.equal(next.aircraft[0].emergency, "engine");
  assert.equal(climbRate(next.aircraft[0]), before / 2);
  const medical = send(state, {kind: "pilot", aircraftId: air.id, text: "", request: {id: "medical-emergency", runway: "24"}});
  assert.equal(medical.aircraft[0].emergency, "medical");
  assert.equal(climbRate(medical.aircraft[0]), before);
  // Ground traffic cannot declare an airborne emergency.
  assert.ok(!catalogFor(getAirport(state)).pilotRequests(state.aircraft[1]).some(r => r.id === "engine-failure"));
});

test("trainees can acknowledge both Mayday declarations with one transmission and no automatic readback", () => {
  for (const id of ["medical-emergency", "engine-failure"] as const) {
    const state = automatic(), [air] = state.aircraft, airport = getAirport(state);
    const frequency = "tower" as const, catalog = catalogFor(airport);
    const declared = send(state, {kind: "pilot", aircraftId: air.id, text: "", request: {id, runway: "24"}});
    const request = pendingPilotMessage(declared, air.id, frequency);
    assert.equal(request?.request?.id, id);
    const [suggestion] = catalog.requestMessageMenu(frequency, air, request);
    assert.equal(suggestion.label, "Roger Mayday");
    assert.equal(suggestion.suggested, true);
    assert.ok(suggestion.instruction);
    const expected = `${air.callsign}, ${frequenciesFor(airport).tower.name}, Roger MAYDAY`;
    assert.equal(catalog.instructionText(air, suggestion.instruction), expected);
    const envelope = envelopeSchema.parse({id: randomUUID(), time: 0, action: {kind: "command", aircraftId: air.id, frequency,
      command: suggestion.instruction, text: "Client text", replyTo: request!.id}});
    assert.ok(menteeActionAllowed(envelope.action, declared));
    const {state: acknowledged, error} = applyEnvelope(declared, envelope);
    assert.equal(error, undefined);
    const message = acknowledged.messages.at(-1)!;
    assert.equal(message.text, expected);
    assert.equal(message.replyTo, request!.id);
    assert.equal(message.autoReadbackAt, undefined);
    assert.equal(pendingRequestCount(acknowledged, air.id, frequency), 0);
    const pending = pendingPilotMessage(acknowledged, air.id, frequency);
    assert.ok(!catalog.requestMessageMenu(frequency, air, pending).some(entry => entry.label === "Roger Mayday"));
    assert.match(applyEnvelope(acknowledged, {...envelope, id: randomUUID()}).error ?? "", /unanswered Mayday/);
  }
});

test("a radio failure that starts while a readback is queued cancels that readback", () => {
  let state = clearToLand(automatic());
  assert.ok(state.messages.at(-1)!.autoReadbackAt !== undefined);
  state = send(state, {kind: "edit", aircraftId: "demo-air", patch: {pilotFault: {radioFailure: true}}});
  state = autoReadbacks(advance(state, 2), 2000, randomUUID);
  assert.equal(replies(state).length, 0);
  assert.equal(state.aircraft[0].clearedToLand, false);
  // Restoring the radio does not replay the instruction the pilot never heard.
  state = send(state, {kind: "edit", aircraftId: "demo-air", patch: {pilotFault: {}}});
  state = autoReadbacks(advance(state, 2), 4000, randomUUID);
  assert.equal(replies(state).length, 0);
});
