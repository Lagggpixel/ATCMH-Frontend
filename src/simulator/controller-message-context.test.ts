import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor} from "./engine";
import {catalogFor, type MenuEntry} from "./catalog";
import {getAirport} from "./airports";
import {exerciseSchema} from "./protocol";
import {pendingPilotMessage, type Action, type Exercise, type Instruction, type Message} from "./model";

const find = (entries: MenuEntry[], ...labels: string[]): MenuEntry => {
  const entry = entries.find(item => item.label === labels[0]);
  assert.ok(entry, labels.join(" → "));
  return labels.length > 1 ? find(entry.children ?? [], ...labels.slice(1)) : entry;
};
const fixture = (station: "ground" | "tower" | "approach" | "center" = "approach") => {
  const engine = engineFor({trainingStation: `EGPH:${station === "ground" ? "tower" : station}`});
  const state = engine.initialExercise(); state.running = true; state.autoReadback = true; state.messages = [];
  const aircraft = engine.newAircraft("context", station !== "ground");
  aircraft.frequency = station; delete aircraft.radar?.report;
  state.aircraft = [aircraft];
  return {engine, state, aircraft, catalog: catalogFor(getAirport(state), state.radarEnvironment)};
};
const act = (state: Exercise, action: Action) => {
  const result = engineFor(state).applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
};
const send = (state: Exercise, command: Instruction, replyTo?: string) => act(state, {
  kind: "command", aircraftId: state.aircraft[0].id, frequency: state.aircraft[0].frequency!, command, replyTo,
  text: catalogFor(getAirport(state), state.radarEnvironment).instructionText(state.aircraft[0], command),
});
const readback = (state: Exercise) => {
  const engine = engineFor(state);
  return engine.autoReadbacks({...state, elapsed: state.elapsed + 2}, 3000, randomUUID);
};

test("both corrections send on an empty frequency without moving the aircraft or inventing a reply", () => {
  for (const station of ["ground", "tower", "approach", "center"] as const) for (const message of ["disregard", "correction-standby"] as const) {
    const {state, aircraft} = fixture(station), before = structuredClone(aircraft);
    const next = readback(send(state, {type: "radio", message}));
    assert.equal(next.messages.length, 1); assert.equal(next.messages[0].sender, "controller");
    assert.deepEqual(next.aircraft[0], before);
  }
});

test("Unable is offered only with a sendable pilot request on this aircraft and frequency", () => {
  const {state, aircraft, catalog} = fixture("tower");
  const request: Message = {id: "runway-request", aircraftId: aircraft.id, sender: "pilot", frequency: "tower", time: 0, text: `${aircraft.callsign}, requesting Runway 06`, request: {id: "runway-change", runway: "06"}};
  const menu = (value?: Message, messages: Message[] = []) => catalog.requestMessageMenu("tower", aircraft, value, state.aircraft, messages);
  assert.ok(!menu().some(e => e.label === "Unable"));
  assert.ok(!menu(request).some(e => e.label === "Unable"));
  for (const invalid of [{...request, aircraftId: "other"}, {...request, frequency: "ground" as const}, {...request, sender: "controller" as const}, {...request, commandId: "readback"}]) {
    assert.ok(!menu(invalid, [invalid]).some(e => e.label === "Unable"));
  }
  state.messages = [request];
  assert.ok(menu(request, state.messages).some(e => e.label === "Unable"));
  assert.equal(send(state, {type: "radio", message: "unable"}, request.id).messages.at(-1)?.replyTo, request.id);
});

test("a reply to a superseded pilot request still transmits, reads back and applies the new instruction", () => {
  for (const station of ["approach", "center"] as const) {
    let {state} = fixture(station);
    state.aircraft[0].flightPlan = [{x: 10, y: 10}]; state.aircraft[0].radar!.navigation = "heading";
    state = act(state, {kind: "pilot", aircraftId: state.aircraft[0].id, text: "Requesting flight following"});
    const oldRequest = state.messages.at(-1)!.id;
    state = send(state, {type: "radio", message: "roger"}, oldRequest);
    state = act(state, {kind: "pilot", aircraftId: state.aircraft[0].id, text: "A newer pilot message"});
    assert.notEqual(pendingPilotMessage(state, state.aircraft[0].id, station)?.id, oldRequest);
    state = readback(send(state, {type: "atc", action: "flight-following"}, oldRequest));
    assert.equal(state.messages.at(-2)?.replyTo, oldRequest);
    assert.match(state.messages.at(-1)!.text, /Proceed on course/);
    assert.equal(state.aircraft[0].radar!.navigation, "route");
  }
});

test("a delayed approach clearance resolves the currently expected approach and canonical transmission", () => {
  for (const station of ["approach", "center"] as const) {
    const {state, aircraft, catalog, engine} = fixture(station);
    const approaches = state.radarEnvironment!.approaches;
    const original = approaches.find(p => p.type === "ils")!, current = approaches.find(p => p.type === "visual")!;
    assert.ok(original); assert.ok(current);
    aircraft.radar!.expected = original.id;
    const command = find(catalog.messageMenu(station, aircraft), "Clear for Approach", `Runway ${original.runway}`).instruction!;
    aircraft.assigned = {expected: current.id};
    assert.equal(engine.validateControllerMessage(state, aircraft, command, station), null);
    const next = send(state, command), sent = next.messages.at(-1)!;
    assert.equal(sent.instruction?.type === "vector" && sent.instruction.approachId, current.id);
    assert.match(sent.text, new RegExp(`cleared visual approach runway ${current.runway}`, "i"));
    assert.doesNotMatch(sent.text, /cleared ILS/i);
    assert.equal(find(catalog.messageMenu(station, next.aircraft[0]), "Clear for Approach").children?.[0].label, `Runway ${current.runway}`);
  }
});

test("Direct To rebuilds its choices and invalidates selected identities after route edits", () => {
  const {aircraft, state, catalog} = fixture();
  aircraft.flightPlan = [{name: "OLD", x: 1, y: 2}, {name: "SAME", x: 3, y: 4}];
  const menu = () => catalog.requestMessageMenu("approach", aircraft, undefined, state.aircraft, state.messages);
  const direct = () => find(menu(), "Vectoring Instructions", "Direct To");
  const oldId = find(direct().children!, "SAME").id;
  aircraft.flightPlan = [{name: "NEW", x: 8, y: 9}, {name: "SAME", x: 13, y: 14}, {name: "LAST", x: 20, y: 21}];
  assert.deepEqual(direct().children!.map(e => e.label), ["NEW", "SAME", "LAST"]);
  assert.notEqual(find(direct().children!, "SAME").id, oldId);
  assert.deepEqual(find(direct().children!, "SAME", "Send").instruction, {type: "route", index: 1, name: "SAME", point: {x: 13, y: 14}});
  aircraft.flightPlan = [];
  assert.ok(!find(menu(), "Vectoring Instructions").children!.some(e => e.label === "Direct To"));
});

test("STAR approval disappears without an arrival STAR and uses the current STAR when sent", () => {
  for (const station of ["approach", "center"] as const) {
    const {state, aircraft, catalog} = fixture(station);
    const request: Message = {id: "star-request", aircraftId: aircraft.id, sender: "pilot", frequency: station, time: 0, text: "Requesting STAR descent", request: {id: "star-descent", runway: "24"}};
    const replies = () => find(catalog.requestMessageMenu(station, aircraft, request), "Respond to STAR Descent Request").children!;
    delete aircraft.arrivalProcedure;
    assert.ok(!replies().some(e => e.label === "Approve"));
    aircraft.arrivalProcedure = "TRAIN1";
    const command = find(replies(), "Approve").instruction!;
    aircraft.arrivalProcedure = "TRAIN2";
    const next = send(state, command), sent = next.messages.at(-1)!;
    assert.equal(sent.instruction?.type === "atc" && sent.instruction.name, "TRAIN2");
    assert.match(sent.text, /proceed as requested/);
  }
});

test("diversion replies require a named request and preserve its destination through edits, reload and readback", () => {
  for (const station of ["approach", "center"] as const) for (const variant of ["course", "vectors"] as const) {
    const setup = fixture(station), {aircraft, catalog} = setup;
    let {state} = setup;
    const target = {name: "Requested Alternate", point: {x: 30, y: -5}};
    aircraft.diversionDestination = target;
    assert.ok(!catalog.requestMessageMenu(station, aircraft).some(e => e.label === "Respond to Diversion Request"));
    state = act(state, {kind: "pilot", aircraftId: aircraft.id, text: "", request: {id: "diversion", runway: "24"}});
    const request = state.messages.at(-1)!;
    assert.deepEqual(request.request?.destination, target);
    state.aircraft[0].diversionDestination = {name: "Unrequested Airport", point: {x: -50, y: 20}};
    state = engineFor(state).restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    const label = variant === "course" ? "Proceed On Course" : "Expect Vectors";
    const command = find(catalog.requestMessageMenu(station, state.aircraft[0], request), "Respond to Diversion Request", label).instruction!;
    assert.equal(command.type === "atc" && command.name, target.name);
    state = act(state, {kind: "pilot", aircraftId: aircraft.id, text: "A newer request"});
    assert.equal(command.type, "atc");
    if (command.type !== "atc") throw new Error("Expected diversion reply");
    state = send(state, {...command, name: "Stale client name", point: {x: 1, y: 1}}, request.id);
    assert.match(state.messages.at(-1)!.text, /Requested Alternate/);
    delete state.aircraft[0].diversionDestination;
    state = readback(state);
    assert.deepEqual(state.aircraft[0].destination, target);
    assert.equal(state.aircraft[0].radar!.navigation, variant === "course" ? "route" : "heading");
    assert.equal(state.messages.at(-1)?.sender, "pilot");
    assert.doesNotMatch(state.messages.at(-1)!.text, /Unable/);
    const original = state.messages.at(-2)!;
    state = act(state, {kind: "command", aircraftId: aircraft.id, frequency: station, command: original.instruction!, text: original.text, resendOf: original.id});
    assert.deepEqual(state.messages.at(-1)?.instruction, original.instruction);
    assert.equal(state.messages.at(-1)?.text, original.text);
  }
});

test("invalid or missing diversion targets never expose approval options", () => {
  const {aircraft, catalog, state, engine} = fixture();
  const request: Message = {id: "invalid", aircraftId: aircraft.id, sender: "pilot", frequency: "approach", time: 0, text: "Requesting diversion", request: {id: "diversion", runway: "24"}};
  aircraft.diversionDestination = {name: "Unrequested", point: {x: 10, y: 20}};
  for (const value of [request, {...request, aircraftId: "other"}, {...request, frequency: "center" as const}, {...request, sender: "controller" as const}, {...request, request: {id: "check-in" as const, runway: "24"}}]) {
    assert.ok(!catalog.requestMessageMenu("approach", aircraft, value).some(e => e.label === "Respond to Diversion Request"));
  }
  state.messages = [request];
  assert.match(engine.validateControllerMessage(state, aircraft, {type: "atc", action: "diversion", variant: "course"}, "approach", request.id)!, /requires a pilot request/);
});

test("Follow Aircraft Ahead sends and reads back without changing movement when there is no leader", () => {
  const {state, aircraft} = fixture("ground"), before = structuredClone(aircraft);
  const next = readback(send(state, {type: "atc", action: "progressive", variant: "follow"}));
  assert.equal(next.messages.length, 2);
  assert.equal(next.messages[1].text, `Wilco, ${aircraft.callsign}`);
  assert.deepEqual(next.aircraft[0], {...before, lastRunway: before.runway});
});

test("impossible progressive taxi transmits and returns Unable without moving the aircraft", () => {
  for (const variant of ["left", "right", "straight", "reverse", "discretion"]) {
    const {state, aircraft} = fixture("ground");
    aircraft.position = {x: 100, y: 100}; aircraft.taxiPath = []; aircraft.taxiIndex = 0;
    const before = structuredClone(aircraft), next = readback(send(state, {type: "atc", action: "progressive", variant}));
    assert.equal(next.messages.length, 2);
    assert.equal(next.messages[1].text, `Unable, ${aircraft.callsign}`);
    assert.match(next.messages[1].unableReason!, /mapped taxiway/);
    assert.deepEqual(next.aircraft[0], before);
  }
});

test("Back Taxi is sendable on and off the runway, including airborne Tower traffic", () => {
  for (const location of ["runway", "off-runway", "airborne"] as const) {
    const {state, aircraft, catalog, engine} = fixture("tower"), g = engine.runwayGeometry("24");
    Object.assign(aircraft, {position: location === "off-runway" ? {x: 100, y: 100} : {...g.departure}, altitude: location === "airborne" ? 3000 : getAirport(state).elevation, mode: location === "airborne" ? "heading" : "taxi", speed: 0, targetSpeed: 0});
    const command = find(catalog.messageMenu("tower", aircraft), "Back Taxi", "Runway 24", "Send").instruction!;
    assert.equal(engine.validateControllerMessage(state, aircraft, command, "tower"), null);
    const next = readback(send(state, command));
    assert.equal(next.messages[0].sender, "controller"); assert.equal(next.messages[1].sender, "pilot");
    if (location === "runway") {assert.doesNotMatch(next.messages[1].text, /Unable/); assert.ok(next.aircraft[0].backTaxi);}
    else {assert.match(next.messages[1].text, /Unable/); assert.deepEqual(next.aircraft[0], aircraft);}
  }
});

test("takeoff cancellation, Already cleared to cross and resend retain their existing context rules", () => {
  const {state, aircraft, catalog, engine} = fixture("tower");
  assert.match(engine.validateControllerMessage(state, aircraft, {type: "atc", action: "cancel-takeoff"}, "tower")!, /requires ground traffic/);
  const ground = {...aircraft, altitude: getAirport(state).elevation};
  assert.equal(engine.validateControllerMessage(state, ground, {type: "atc", action: "cancel-takeoff"}, "tower"), null);
  assert.equal(engine.validateControllerMessage(state, ground, {type: "atc", action: "progressive", variant: "crossed"}, "tower"), null);
  assert.ok(!catalog.messageMenu("tower", aircraft).some(e => e.resend));
  const sent = send(state, {type: "radio", message: "roger"});
  assert.ok(catalog.requestMessageMenu("tower", sent.aircraft[0], undefined, sent.aircraft, sent.messages).some(e => e.resend));
});
