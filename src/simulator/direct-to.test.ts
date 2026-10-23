import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {catalogFor, type MenuEntry} from "./catalog";
import {engineFor, restoreExercise} from "./engine";
import {getAirport} from "./airports";
import {exerciseSchema, envelopeSchema, menteeActionAllowed} from "./protocol";
import {directToWaypoints} from "./direct-to";
import {ReplayTimeline, replayDelta} from "./replays";
import type {Action, Instruction} from "./model";

function fixture(station: "approach" | "center" = "approach") {
  const engine = engineFor({trainingStation: `EGPH:${station}`}), state = engine.initialExercise();
  state.running = true; state.autoReadback = false;
  const a = engine.newAircraft("direct", true);
  a.position = {x: -10, y: 0}; a.heading = a.targetHeading = 90; a.altitude = 8000;
  a.flightPlan = [{name: "START", x: -10, y: 0}, {name: "MERGE", x: 0, y: 10}, {name: "MERGE", x: 10, y: 10}, {name: "FINAL", x: 10, y: 0}];
  a.radar!.routeIndex = 1; delete a.radar!.report;
  state.aircraft = [a];
  return {engine, state, a};
}
const path = (entries: MenuEntry[], ...labels: string[]): MenuEntry => {
  const entry = entries.find(entry => (entry.label === labels[0] || /^\d{4,5}$/.test(labels[0]) && entry.label===`${Number(labels[0]).toLocaleString("en-US")}ft`)); assert.ok(entry, labels.join(" → "));
  return labels.length > 1 ? path(entry.children ?? [], ...labels.slice(1)) : entry;
};

for (const station of ["approach", "center"] as const) test(`${station}: Direct To menu uses explicit Send or immediate altitude with distinct occurrences`, () => {
  const {engine, a} = fixture(station), catalog = catalogFor(getAirport());
  const menu = catalog.messageMenu(station, a);
  const direct = path(menu, "Vectoring Instructions", "Direct To");
  assert.deepEqual(direct.children!.map(entry => entry.label), ["START", "MERGE (1)", "MERGE (2)", "FINAL"]);
  assert.equal(direct.children![1].instruction, undefined);
  const send = path(direct.children!, "MERGE (2)", "Send").instruction!;
  const descend = path(direct.children!, "MERGE (2)", "Assign Altitude", "< 10,000ft", "6000").instruction!;
  assert.equal(descend.type, "route"); assert.equal(path(direct.children!, "MERGE (2)", "Assign Altitude", "< 10,000ft", "6000").children, undefined);
  assert.equal(catalog.instructionText(a, send), `${a.callsign}, proceed direct MERGE`);
  const text = catalog.instructionText(a, descend);
  assert.equal(text, `${a.callsign}, proceed direct MERGE, descend and maintain 6,000ft`);
  assert.equal(engine.readbackText(a.callsign, text, descend), `Proceed direct MERGE, descend and maintain 6,000ft, ${a.callsign}`);
});

test("Direct To rejects invalid/stale waypoints and unavailable altitudes before movement or radio writes", () => {
  const {engine, state, a} = fixture();
  for (const command of [{type: "route", index: -1}, {type: "route", index: 1.5}, {type: "route", index: 99}, {type: "route", index: 2, name: "STALE"}, {type: "route", index: 2, altitude: {unit: "feet", value: 1234}}, {type: "route", index: 2, altitude: {unit: "feet", value: 0}}] as Instruction[]) {
    const result = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: a.id, frequency: "approach", command, text: "Untrusted"}});
    assert.ok(result.error); assert.equal(result.state, state);
  }
});

test("Direct To cancels hold/capture, follows the selected occurrence and retains its tail through reload/replay", () => {
  const {engine, state, a} = fixture();
  a.atcManeuver = {kind: "hold", hand: "left", heading: 90, remaining: 360, altitude: 8000, previousMode: "heading", previousLeg: "downwind"};
  Object.assign(a.radar!, {navigation: "approach", expected: "ils-24", cleared: "ils-24", captured: true, localizer: true, glideslope: true, approachIntercept: {seconds: 60, entered: true}});
  const command: Instruction = {type: "route", index: 2, name: "MERGE", altitude: {unit: "feet", value: 6000}};
  const action: Action = {kind: "maneuver", aircraftId: a.id, command};
  const result = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action}); assert.equal(result.error, undefined);
  let moved = result.state;
  assert.equal(moved.aircraft[0].radar!.routeIndex, 2); assert.equal(moved.aircraft[0].atcManeuver, undefined);
  assert.equal(moved.aircraft[0].radar!.cleared, undefined); assert.equal(moved.aircraft[0].radar!.expected, "ils-24");
  assert.equal(moved.aircraft[0].radar!.altitudeAssignedFrom, 8000);
  assert.ok(moved.aircraft[0].targetHeading > 60 && moved.aircraft[0].targetHeading < 70);
  assert.deepEqual(moved.aircraft[0].flightPlan, a.flightPlan);
  moved = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(moved))));
  assert.deepEqual(new ReplayTimeline(state, [{sequence: 1, at: 0, delta: replayDelta(state, moved), interpolate: false}]).at(0), moved);
  for (let t = 0; t < 500; t++) moved = engine.advance(moved, 1);
  assert.ok(moved.aircraft[0].radar!.routeIndex >= 3);
  assert.equal(moved.aircraft[0].altitude, 6000);
});

test("sending Direct To keeps manual movement pending until the mentor assigns it", () => {
  const {engine, state, a} = fixture();
  const action: Action = {kind: "command", aircraftId: a.id, frequency: "approach", command: {type: "route", index: 2}, text: "Client label"};
  assert.ok(menteeActionAllowed(envelopeSchema.parse({id: randomUUID(), time: 0, action}).action, state));
  const sent = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action});
  assert.equal(sent.error, undefined); assert.equal(sent.state.aircraft[0].radar!.routeIndex, 1);
  assert.equal(sent.state.messages.at(-1)!.text, `${a.callsign}, proceed direct MERGE`);
  assert.deepEqual(directToWaypoints(a, state.radarEnvironment!)[2], {index: 2, name: "MERGE", label: "MERGE (2)"});
});
