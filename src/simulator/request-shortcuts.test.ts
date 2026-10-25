import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {instructionText, messageMenu, pilotRequests, requestMessageMenu, type MenuEntry} from "./catalog";
import {applyEnvelope, initialExercise} from "./engine";
import {pendingPilotMessage, type Action, type Exercise, type Message, type PilotRequestSelection} from "./model";

const menuContent = (entries: MenuEntry[]): unknown[] => entries.map(({id: _id, ...entry}) => ({...entry, ...(entry.children ? {children: menuContent(entry.children)} : {})}));
function act(state: Exercise, action: Action) {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
}
function start(id: PilotRequestSelection["id"]) {
  let state = initialExercise();
  const a = state.aircraft[id === "pushback" || id === "cross-runway" ? 1 : 0];
  state = act(state, {kind: "pilot", aircraftId: a.id, text: "", request: {id, runway: "24"}});
  const aircraft = state.aircraft.find(other => other.id === a.id)!;
  return {state, a: aircraft, message: pendingPilotMessage(state, a.id, a.frequency!)!};
}

test("contextual replies add a first shortcut and retain the complete ordinary command tree", () => {
  for (const [id, _label, originalLabel] of [
    ["pushback", "Pushback Approved", "Pushback Approved"],
    ["runway-change", "Unable", "Unable"],
    ["cross-runway", "Cross Runway", "Cross Runway..."],
    ["go-around", "Respond to Go Around", "Respond to Go Around"],
  ] as const) {
    const {a, message, state} = start(id), ordinary = messageMenu(a.frequency!, a, [], message);
    const menu = requestMessageMenu(a.frequency!, a, message, state.aircraft, state.messages);
    const reply=menu.find(entry=>entry.label===originalLabel)!;assert.ok(reply);assert.equal(reply.suggested,true);assert.equal(menu.filter(entry=>entry.label===originalLabel).length,2);assert.equal(menu[0],reply);
    assert.equal(menu.filter(entry => entry.suggested).length, 1);
    assert.deepEqual(menuContent(menu.filter(e=>!e.suggested && e.label!=="Unable")),menuContent(ordinary));
    const original = ordinary.find(entry=>entry.label===originalLabel) ?? reply;
    assert.ok(original); assert.ok(original===reply || !original.suggested);
    assert.deepEqual(menuContent(reply.children ?? []), menuContent(original.children ?? []));
    assert.deepEqual(reply.instruction, original.instruction);
  }
});

test("all other requests retain the normal menu with no suggested command or generic Unable", () => {
  const state = initialExercise();
  for (const a of state.aircraft) for (const request of pilotRequests(a)) {
    if (["pushback", "runway-change", "cross-runway", "go-around", "transition"].includes(request.id)) continue;
    const message: Message = {id: "request", aircraftId: a.id, sender: "pilot", text: "pilot request", frequency: a.frequency!, time: 1, request: {id: request.id, runway: "24"}};
    const menu = requestMessageMenu(a.frequency!, a, message, state.aircraft, state.messages);
    assert.deepEqual(menuContent(menu), menuContent(messageMenu(a.frequency!, a, [], message)));
    assert.ok(!menu.some(entry => entry.label === "Unable" || entry.suggested));
  }
});

test("legacy/manual radio requests and automatic self go-arounds get the same shortcuts", () => {
  for (const [id, phrase, label] of [
    ["pushback", "ready for pushback with information BRAVO", "Pushback Approved"],
    ["runway-change", "requesting runway 06", "Unable"],
    ["cross-runway", "requesting to cross runway 24", "Cross Runway"],
    ["go-around", "going around", "Respond to Go Around"],
  ] as const) {
    const {a, message, state} = start(id); delete message.request;
    message.text = `${a.callsign}, ${phrase}`;
    const found=requestMessageMenu(a.frequency!,a,message,state.aircraft,state.messages).find(e=>e.label===(label==="Cross Runway"?"Cross Runway...":label))!;assert.ok(found);
    assert.equal(found.suggested,true);
  }
});

test("shortcuts stay while the controller is on standby and disappear when the request is answered", () => {
  const initial = start("pushback"), a = initial.a;
  let {state, message} = initial;
  const send = (command: Extract<Action, {kind: "command"}>["command"]) => {
    state = act(state, {kind: "command", aircraftId: a.id, command, frequency: a.frequency!, text: instructionText(a, command), replyTo: message.id});
  };
  send({type: "radio", message: "standby"});
  assert.equal(requestMessageMenu(a.frequency!, a, pendingPilotMessage(state, a.id, a.frequency!)).find(e=>e.label==="Pushback Approved")?.suggested, true);
  send({type: "pushback", tail: "north"});
  assert.deepEqual(menuContent(requestMessageMenu(a.frequency!, a, pendingPilotMessage(state, a.id, a.frequency!))), menuContent(messageMenu(a.frequency!, a)));
  message = {...message, commandId: "pilot-readback"};
  assert.deepEqual(menuContent(requestMessageMenu(a.frequency!, a, message)), menuContent(messageMenu(a.frequency!, a)));
  assert.deepEqual(menuContent(requestMessageMenu("tower", a, {...message, commandId: undefined})), menuContent(messageMenu("tower", a)));
});

test("runway-change Unable shortcut sends the same contextual rejection as the ordinary button", () => {
  const {state, a, message} = start("runway-change"), menu = requestMessageMenu(a.frequency!, a, message, state.aircraft, state.messages);
  const before = structuredClone(state.aircraft);
  for (const entry of menu.filter(e=>e.label==="Unable")) {
    const command = entry.children![0].instruction!;
    const next = act(state, {kind: "command", aircraftId: a.id, command, frequency: a.frequency!, text: instructionText(a, command), replyTo: message.id});
    assert.equal(next.messages.at(-1)!.text, `${a.callsign}, unable`);
    assert.equal(next.messages.at(-1)!.replyTo, message.id);
    assert.deepEqual(next.aircraft, before);
    assert.equal(pendingPilotMessage(next, a.id, a.frequency!), undefined);
    assert.ok(!requestMessageMenu(a.frequency!, a, pendingPilotMessage(next, a.id, a.frequency!)).some(item => item.label === "Unable"));
  }
});
