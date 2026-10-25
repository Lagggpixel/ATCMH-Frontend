import test from "node:test";
import assert from "node:assert/strict";
import {aircraftLabel, aircraftLabelIdentity, towerDistance} from "./aircraft-label";
import {engineFor, applyEnvelope} from "./engine";
import {getAirport} from "./airports";
import {exerciseSchema} from "./protocol";
import type {Frequency, Message} from "./model";

const engine = engineFor({trainingStation: "EGPH:approach"});
const airport = getAirport({airport: "EGPH"});
const aircraft = () => {
  const a = engine.newAircraft("label", true);
  a.radar = {station: "approach", navigation: "heading", routeIndex: 0};
  Object.assign(a, {assigned: undefined, altitude: 15999, speed: 100, groundSpeed: 227.9, position: {x: 0, y: 10.9}, verticalSpeed: 0});
  return a;
};
const message = (instruction: Message["instruction"]): Message => ({id: "command", aircraftId: "label", time: 1, frequency: "approach", sender: "controller", text: "Synthetic", instruction});

test("native identity cycle, exact callsign limit, type aliases and fallback", () => {
  assert.equal(aircraftLabelIdentity("B738", "Speedbird 1", 0), "B738".padEnd(20));
  for (const phase of [1, 2, 4, 5]) assert.equal(aircraftLabelIdentity("B738", "Speedbird 1", phase), "Speedbird 1".padEnd(18));
  assert.equal(aircraftLabelIdentity("Boeing 737-800", "Call", 3), "B738".padEnd(20));
  assert.equal(aircraftLabelIdentity("Unknown", "Call", 6), "UNK".padEnd(20));
  for (const length of [18, 19, 20, 21, 40]) {
    const callsign = "A".repeat(length);
    assert.equal(aircraftLabelIdentity("C172", callsign, 1), length > 20 ? "A".repeat(17) + "..." : callsign);
  }
});

for (const station of ["ground", "tower", "approach", "departure", "center"] as Frequency[]) test(`${station}: native numeric fields use the viewing station`, () => {
  const a = aircraft(); a.frequency = "ground";
  const label = aircraftLabel(a, airport, station);
  assert.equal(label.flight, "159 227KT" + (station === "tower" ? " 10NM" : ""));
  assert.equal(label.additional, undefined);
  a.groundSpeed = 0; assert.match(aircraftLabel(a, airport, station).flight, / 0KT/);
  delete a.groundSpeed; a.speed = 99.9; assert.match(aircraftLabel(a, airport, station).flight, / 99KT/);
  a.altitude = -199; assert.match(aircraftLabel(a, airport, station).flight, /^-1 /);
});

test("Tower distance uses native spherical geometry, independent of altitude and destination", () => {
  const a = aircraft();
  assert.equal(towerDistance(a, airport), 10);
  a.position = {x: 0, y: 0}; assert.equal(towerDistance(a, airport), 0);
  a.position = {x: 0, y: 59.99}; assert.equal(towerDistance(a, airport), 60, "mean-radius great-circle distance crosses the whole-NM boundary here");
  const distance = towerDistance(a, airport); a.altitude = 40000;
  a.destination = {name: "KJFK", point: {x: 100, y: 100}};
  assert.equal(towerDistance(a, airport), distance);
});

for (const target of [14000, 15999, 18000]) test(`assigned ${target} always uses > before and after readback/replay`, () => {
  let state = engine.initialExercise(); state.aircraft = [aircraft()]; state.autoReadback = false;
  const result = applyEnvelope(state, {id: crypto.randomUUID(), time: 1, action: {kind: "command", aircraftId: "label", frequency: "approach", text: "", command: {type: "vector", altitude: target === 18000 ? {unit: "flight-level", value: 180} : {unit: "feet", value: target === 15999 ? 16000 : target}}}});
  assert.equal(result.error, undefined); state = result.state;
  const assigned = target === 15999 ? 16000 : target;
  assert.equal(state.aircraft[0].radar?.targetAltitude, undefined);
  assert.equal(aircraftLabel(state.aircraft[0], airport, "approach").flight, `159 > ${Math.trunc(assigned / 100)} 227KT`);
  state = exerciseSchema.parse(JSON.parse(JSON.stringify(state)));
  state.aircraft[0].altitude = assigned;
  assert.equal(aircraftLabel(state.aircraft[0], airport, "approach").flight, `${Math.trunc(assigned / 100)} > ${Math.trunc(assigned / 100)} 227KT`);
});

test("local assigned altitude and flight levels use the same native separator", () => {
  const a = aircraft(); delete a.radar; a.assigned = {altitude: {unit: "flight-level", value: 180}};
  assert.equal(aircraftLabel(a, airport, "ground").flight, "159 > 180 227KT");
  a.assigned.altitude = {unit: "feet", value: 0}; assert.equal(aircraftLabel(a, airport, "ground").flight, "159 227KT");
});

for (const [speed, expected] of [[-251, "descent"], [-250, undefined], [0, undefined], [250, undefined], [251, "climb"]] as const) test(`vertical glyph threshold ${speed}fpm`, () => {
  const a = aircraft(); a.verticalSpeed = speed;
  assert.equal(aircraftLabel(a, airport, "tower").vertical, expected);
});

test("Approach/Departure/Center share native VIS, STAR, HOLD and runway placeholders", () => {
  const a = aircraft(), environment = engine.initialExercise().radarEnvironment!;
  const visual = environment.approaches.find(p => p.type === "visual")!;
  a.assigned = {expected: visual.id}; a.arrivalProcedure = "TEST1";
  const messages = [message({type: "atc", action: "hold", altitude: {unit: "feet", value: 5000}})];
  const before = JSON.stringify({a, environment, messages});
  for (const station of ["approach", "departure", "center"] as const) assert.equal(aircraftLabel(a, airport, station, environment, messages).additional, `TEST1 STAR - VIS - EGPH - HOLD ${visual.runway}`);
  for (const station of ["ground", "tower"] as const) assert.equal(aircraftLabel(a, airport, station, environment, messages).additional, undefined);
  assert.equal(JSON.stringify({a, environment, messages}), before);
  a.assigned = undefined; delete a.arrivalProcedure;
  assert.equal(aircraftLabel(a, airport, "approach", environment, [message({type: "atc", action: "flight-following", name: "KJFK"})]).additional, "FF - KJFK ----");
  assert.equal(aircraftLabel(a, airport, "center", environment, [message({type: "atc", action: "radar-vectors", name: "KJFK"})]).additional, "RV - KJFK ----");
});

test("retracted and unrelated radio history cannot add label guidance", () => {
  const a = aircraft(), m = message({type: "atc", action: "flight-following", name: "KJFK"});
  assert.equal(aircraftLabel(a, airport, "approach", undefined, [{...m, retractedBy: "undo"}, {...m, aircraftId: "other"}]).additional, undefined);
});
