import test from "node:test";
import assert from "node:assert/strict";
import {controllerStripText} from "./controller-strip";
import {engineFor} from "./engine";
import {getAirport} from "./airports";
import type {Instruction, Message, RadarEnvironment} from "./model";

const airport = getAirport({airport: "PHOG"});
const engine = engineFor({airport: "PHOG", trainingStation: "PHOG:approach"});
const environment: RadarEnvironment = {version: 1, name: "Strip test", range: 80, boundary: [], fixes: [], approaches: [
  {id: "ils", type: "ils", runway: "02", finalDistance: 20, captureWidth: 2, glideAngle: 3, missedHeading: 20},
  {id: "gps", type: "gps", runway: "20", finalDistance: 20, captureWidth: 2, glideAngle: 3, missedHeading: 200},
  {id: "visual", type: "visual", runway: "05", finalDistance: 20, captureWidth: 2, glideAngle: 3, missedHeading: 50},
  {id: "other", type: "ils", airportIcao: "PHNL", runway: "04R", finalDistance: 20, captureWidth: 2, glideAngle: 3, missedHeading: 40},
]};
const aircraft = () => {const a = engine.newAircraft("strip", true); a.radar = {station: "approach", navigation: "heading", routeIndex: 0}; a.assigned = undefined; return a;};
const message = (instruction: Instruction): Message => ({id: "instruction", aircraftId: "strip", time: 1, frequency: "approach", sender: "controller", text: "Synthetic test", instruction});

test("unassigned radar strips show native placeholders without a RWY prefix", () => {
  const a = aircraft(), saved = structuredClone(a);
  assert.deepEqual(controllerStripText(a, airport, environment), {runway: "----", additionalInfo: "----"});
  assert.deepEqual(a, saved);
});
for (const [id, runway, guidance] of [["ils", "02", "ILS"], ["gps", "20", "GPS"], ["visual", "05", "VIS"], ["other", "04R", "ILS"]]) {
  test(`${guidance} guidance uses the approach destination and a separate runway`, () => {
    const a = aircraft(); a.assigned = {expected: id};
    assert.deepEqual(controllerStripText(a, airport, environment), {runway, additionalInfo: `${guidance} - ${id === "other" ? "PHNL" : "PHOG"}`});
  });
}
test("structured pilot approach requests appear without granting approach or landing clearance", () => {
  const a = aircraft(), request: Message = {...message({type: "radio", message: "roger"}), sender: "pilot", instruction: undefined, request: {id: "request-approach", approachId: "other", runway: "04R", includeRunway: true}};
  assert.deepEqual(controllerStripText(a, airport, environment, [request]), {runway: "04R", additionalInfo: "ILS - PHNL"});
  assert.equal(a.radar?.cleared, undefined); assert.equal(a.clearedToLand, false);
});
test("an any-runway approach request shows guidance without inventing a runway assignment", () => {
  const a = aircraft(), request: Message = {...message({type: "radio", message: "roger"}), sender: "pilot", instruction: undefined, request: {id: "request-approach", approachId: "other", runway: "04R", includeRunway: false}};
  assert.deepEqual(controllerStripText(a, airport, environment, [request]), {runway: "----", additionalInfo: "ILS - PHNL"});
});
test("controller assignments are visible before a pilot readback", () => {
  const a = aircraft();
  assert.deepEqual(controllerStripText(a, airport, environment, [message({type: "expect-approach", approachId: "gps"})]), {runway: "20", additionalInfo: "GPS - PHOG"});
});
test("FF and RV use structured controller choices and destination ICAOs", () => {
  const a = aircraft();
  for (const [action, code] of [["flight-following", "FF"], ["radar-vectors", "RV"]] as const)
    assert.equal(controllerStripText(a, airport, environment, [message({type: "atc", action, name: "PHNL"})]).additionalInfo, `${code} - PHNL`);
});
test("STAR and HOLD use the native ordering and hold exit removes the suffix", () => {
  const a = aircraft(); a.assigned = {expected: "ils"}; a.arrivalProcedure = "BEACH4";
  const hold = message({type: "atc", action: "hold", altitude: {unit: "feet", value: 5000}});
  assert.equal(controllerStripText(a, airport, environment, [hold]).additionalInfo, "BEACH4 STAR - ILS - PHOG - HOLD");
  assert.equal(controllerStripText(a, airport, environment, [hold, message({type: "atc", action: "exit-hold"})]).additionalInfo, "BEACH4 STAR - ILS - PHOG");
});
test("missing guidance, retracted instructions and unrelated aircraft never invent a clearance", () => {
  const a = aircraft(), m = message({type: "expect-approach", approachId: "ils"});
  assert.equal(controllerStripText(a, airport, environment, [{...m, retractedBy: "correction"}, {...m, aircraftId: "different"}]).additionalInfo, "----");
});
test("native local formatting and go-around guidance cleanup", () => {
  const a = aircraft();
  const land = message({type: "land", runway: "02", option: false});
  assert.equal(controllerStripText(a, airport, environment, [land]).additionalInfo, "LOCPHOG");
  assert.equal(controllerStripText(a, airport, environment, [land, message({type: "go-around"})]).additionalInfo, "----");
});
