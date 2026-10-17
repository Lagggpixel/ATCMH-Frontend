import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {instructionText, messageMenu, type MenuEntry} from "./catalog";
import {advance, applyEnvelope, autoReadbacks, initialExercise, restoreExercise} from "./engine";
import {pendingCommands, pendingPilotMessage, type Action, type Exercise, type Instruction} from "./model";
import {envelopeSchema, exerciseSchema, menteeActionAllowed} from "./protocol";

const act = (state: Exercise, action: Action, id = randomUUID()) => {
  const result = applyEnvelope(state, {id, time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
};
const send = (state: Exercise, command: Instruction, aircraftId = "demo-ground", replyTo?: string) => {
  const a = state.aircraft.find(a => a.id === aircraftId)!;
  return act(state, {kind: "command", aircraftId, command, frequency: a.frequency!, text: instructionText(a, command), ...(replyTo ? {replyTo} : {})});
};
const tick = (state: Exercise) => autoReadbacks(advance(state, 2), 2000, randomUUID);
const active = () => ({...initialExercise(), running: true, autoReadback: true});
const all = (entries: MenuEntry[]): MenuEntry[] => entries.flatMap(entry => [entry, ...all(entry.children ?? [])]);

test("removed commands are absent and all hold-short submenus offer both bare runway numbers", () => {
  const state = initialExercise();
  for (const [frequency, aircraft] of [["ground", state.aircraft[1]], ["tower", state.aircraft[1]], ["tower", state.aircraft[0]]] as const) {
    const entries = all(messageMenu(frequency, aircraft));
    for (const label of ["Unable", "Unable, Divert", "Wilco", "Tow Approved"]) assert.ok(!entries.some(e => e.label === label), label);
    for (const entry of entries.filter(e => /^Hold short/i.test(e.label))) {
      assert.deepEqual(entry.children?.map(e => e.label), ["Runway 24", "Runway 06"]);
      assert.ok(entry.children?.every(e => e.instruction?.type === "hold-short" || e.children));
    }
    assert.deepEqual(entries.find(e => e.label === "Correction")?.children?.map(e => e.label), ["Correction, Stand by", "Disregard last message"]);
    assert.equal(entries.find(e => e.label === "Ask for Intentions")?.children?.[0].instruction?.type, "radio");
  }
});

test("Say Intentions and Standby are transmissions, never movement assignments or invented readbacks", () => {
  for (const [message, wording] of [["say-intentions", "say intentions"], ["standby", "stand by"]] as const) {
    const state = active(), before = structuredClone(state.aircraft);
    const next = send(state, {type: "radio", message});
    assert.deepEqual(next.aircraft, before);
    assert.equal(next.messages[0].text, `Easy 571, ${wording}`);
    assert.equal(next.messages[0].autoReadbackAt, undefined);
    assert.deepEqual(pendingCommands(next, "demo-ground"), []);
    assert.equal(tick(next).messages.length, 1);
    assert.match(applyEnvelope(next, {id: "assign-radio", time: 1, action: {kind: "pilot", aircraftId: "demo-ground", text: "Readback", replyTo: next.messages[0].id, assign: true}}).error!, /answered or superseded/);
    const response = act(next, {kind: "pilot", aircraftId: "demo-ground", text: "Requesting departure, Easy 571"});
    assert.equal(response.messages.at(-1)!.sender, "pilot");
  }
});

test("both correction choices cancel queued execution and stale replies without reviving older commands", () => {
  for (const message of ["correction-standby", "disregard"] as const) {
    let state = send(send(active(), {type: "stop"}), {type: "pushback", tail: "north"});
    const target = state.messages.at(-1)!.id;
    state = send(state, {type: "radio", message});
    assert.equal(state.messages[1].retractedBy, state.messages[2].id);
    assert.equal(state.messages[1].autoReadbackAt, undefined);
    state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    assert.deepEqual(pendingCommands(state, "demo-ground"), []);
    const next = tick(state); assert.equal(next.messages.length, 3); assert.equal(next.aircraft[1].mode, "parked"); assert.equal(next.aircraft[1].holding, false);
    assert.match(applyEnvelope(next, {id: "stale", time: 1, action: {kind: "pilot", aircraftId: "demo-ground", text: "Pushback", replyTo: target, assign: true}}).error!, /answered or superseded/);
    const replacement = tick(send(next, {type: "stop"}));
    assert.equal(replacement.aircraft[1].holding, true); assert.equal(replacement.messages.at(-1)!.sender, "pilot");
  }
});

test("Disregard targets only the immediate previous transmission to that aircraft on that channel", () => {
  let state = send(active(), {type: "stop"});
  state = send(state, {type: "radio", message: "say-intentions"});
  state = send(state, {type: "radio", message: "standby"}, "demo-air");
  state = send(state, {type: "radio", message: "disregard"});
  assert.equal(state.messages[0].retractedBy, undefined);
  assert.equal(state.messages[1].retractedBy, state.messages[3].id);
  assert.equal(state.messages[2].retractedBy, undefined);
  assert.equal(tick(state).aircraft[1].holding, true, "the earlier movement instruction was not the withdrawn message");
  assert.match(applyEnvelope(initialExercise(), {id: "empty", time: 1, action: {kind: "command", aircraftId: "demo-ground", frequency: "ground", command: {type: "radio", message: "disregard"}, text: "Disregard"}}).error!, /no previous controller message/);
});

test("controller Unable replies only to the current pilot request, including runway changes", () => {
  let state = act(active(), {kind: "pilot", aircraftId: "demo-air", text: "Speedbird 124, requesting Runway 06"});
  const request = pendingPilotMessage(state, "demo-air", "tower")!;
  state = send(state, {type: "radio", message: "standby"}, "demo-air");
  assert.equal(pendingPilotMessage(state, "demo-air", "tower")?.id, request.id);
  const before = structuredClone(state.aircraft[0]);
  state = send(state, {type: "radio", message: "unable"}, "demo-air", request.id);
  assert.equal(state.messages.at(-1)!.text, "Speedbird 124, unable");
  assert.equal(state.messages.at(-1)!.replyTo, request.id);
  assert.equal(pendingPilotMessage(state, "demo-air", "tower"), undefined);
  assert.deepEqual(state.aircraft[0], before); assert.equal(tick(state).messages.length, state.messages.length);
  const action: Action = {kind: "command", aircraftId: "demo-air", frequency: "tower", command: {type: "radio", message: "unable"}, text: "Unable", replyTo: request.id};
  assert.match(applyEnvelope(state, {id: "stale-unable", time: 1, action}).error!, /answered or superseded/);
  delete action.replyTo;
  assert.match(applyEnvelope(state, {id: "standalone-unable", time: 1, action}).error!, /only as a reply/);
  assert.ok(envelopeSchema.safeParse({id: "radio", time: 1, action}).success); assert.ok(menteeActionAllowed(action));
});

test("pilot Unable remains a reply and never assigns the rejected clearance", () => {
  let state = send(active(), {type: "runway", runway: "06"}, "demo-air");
  state = act(state, {kind: "pilot", aircraftId: "demo-air", text: "Unable, Speedbird 124", replyTo: state.messages[0].id});
  assert.equal(tick(state).aircraft[0].runway, "24");
  assert.equal(tick(state).messages.length, 2);
  assert.equal(pendingPilotMessage(state, "demo-air", "tower"), undefined);
});

test("withdrawing a completed clearance preserves already assigned movement and is idempotent", () => {
  let state = tick(send(active(), {type: "pushback", tail: "north"}));
  const before = structuredClone(state.aircraft[1]);
  const envelope = {id: "withdraw", time: 1, action: {kind: "command", aircraftId: "demo-ground", frequency: "ground", command: {type: "radio", message: "disregard"}, text: "Easy 571, Disregard last message"} as Action};
  state = applyEnvelope(state, envelope).state;
  assert.deepEqual(state.aircraft[1], before);
  assert.equal(applyEnvelope(state, envelope).state, state);
  assert.equal(state.messages[0].retractedBy, "withdraw");
});
