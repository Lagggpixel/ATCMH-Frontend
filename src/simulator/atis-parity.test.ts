import test from "node:test";
import assert from "node:assert/strict";
import {ATIS_REMARKS, ATIS_NOTAMS, atisFrequencies, atisRunwayWind, currentAtisOptions} from "./atis-options";
import {applyEnvelope, initialExercise} from "./engine";
import {getAirport} from "./airports";
import {envelopeSchema, exerciseSchema} from "./protocol";
import {radarEnvironmentFor} from "./radar";
import {EXERCISE_WEATHER, type Action, type Exercise} from "./model";
import type {RadioFacility} from "./aviation";

let sequence = 0;
const act = (state: Exercise, action: Action) => {
  assert.equal(envelopeSchema.safeParse({id: "validate", time: 0, action}).success, true);
  const result = applyEnvelope(state, {id: `atis-${++sequence}`, time: 0, action});
  assert.equal(result.error, undefined);
  return exerciseSchema.parse(JSON.parse(JSON.stringify(result.state))) as Exercise;
};
const airport = getAirport();
const facility = (id: string, type: RadioFacility["type"] = "approach"): RadioFacility => ({id, type, name: `Edinburgh ${type}`, mhz: id === "one" ? "121.20" : "128.90", active: true, ...airport.origin});

test("IF 26.4 has ten ordered remarks and two separate NOTAMs with broadcast wording", () => {
  assert.deepEqual(ATIS_REMARKS.map(o => o.label), ["No intersection dept.", "No pattern work", "Gate Hold", "No Light Aircraft", "Rolling dept", "FPL Rqd", "Straight out dept", "Mult. Freq. In Use", "SID/STAR Use Rcmd", "SID/STAR Use Req"]);
  assert.deepEqual(ATIS_NOTAMS.map(o => o.label), ["Event", "Low visibility"]);
  let state = initialExercise();
  state = act(state, {kind: "atis", draft: {...state.atis, remarks: ATIS_REMARKS.map(o => o.label), notams: ATIS_NOTAMS.map(o => o.label), procedures: ["TLA1A\nSID", "TWEED3A\nSTAR"]}});
  assert.equal(state.publishedAtis, "ATIS UNAVAILABLE");
  state = act(state, {kind: "publish-atis"});
  for (const option of [...ATIS_REMARKS, ...ATIS_NOTAMS]) assert.ok(state.publishedAtis.includes(option.text), option.label);
  assert.match(state.publishedAtis, /Recommended Departure Procedures, TLA1A.*Recommended Arrival Procedures, TWEED3A/);
  const published = state.publishedAtis;
  state = act(state, {kind: "atis", draft: {...state.atis, letter: "BRAVO", remarks: []}});
  assert.equal(state.publishedAtis, published);
  state = act(state, {kind: "publish-atis"});
  assert.match(state.publishedAtis, /BRAVO/);
  state = act(state, {kind: "publish-atis"});
  assert.match(state.publishedAtis, /BRAVO/);
});

test("frequency sectors persist, publish with IF wording, and omit inactive/unavailable facilities", () => {
  let state = initialExercise();
  state.radarEnvironment = {...radarEnvironmentFor(airport), facilities: [facility("one"), facility("two"), facility("tower", "tower"), facility("center", "center")]};
  assert.deepEqual(atisFrequencies(airport, state.radarEnvironment).map(f => f.id), ["one", "two"]);
  state = act(state, {kind: "atis", draft: {...state.atis, frequencyAssignments: [{facilityId: "one", directions: ["South", "North"]}, {facilityId: "two", directions: []}]}});
  state = act(state, {kind: "publish-atis"});
  assert.match(state.publishedAtis, /contact approach on 121.20 when arriving from the North and South/);
  assert.doesNotMatch(state.publishedAtis, /128.90/);
  state.radarEnvironment!.facilityActivity = {two: false};
  assert.deepEqual(atisFrequencies(airport, state.radarEnvironment), []);
  state = act(state, {kind: "publish-atis"});
  assert.doesNotMatch(state.publishedAtis, /contact approach/);
  assert.equal(state.atis.frequencyAssignments?.[0].directions.length, 2, "hidden selections survive facility changes");
  assert.equal(envelopeSchema.safeParse({id: "invalid", time: 0, action: {kind: "atis", draft: {...state.atis, frequencyAssignments: [{facilityId: "one", directions: ["Up"]}]}}}).success, false);
});

test("IF runway colors use the five-knot and 45/90 degree boundaries", () => {
  const color = (direction: number, speed = 10) => atisRunwayWind(0, {...EXERCISE_WEATHER, windDirection: direction, windSpeed: speed});
  assert.equal(color(180, 5), "headwind");
  assert.equal(color(45), "headwind"); assert.equal(color(46), "crosswind");
  assert.equal(color(90), "crosswind"); assert.equal(color(91), "tailwind");
  assert.equal(color(359), "headwind");
});

test("legacy labels retain IF options and custom text without rewriting archived drafts", () => {
  const draft = {...initialExercise().atis, letter: "XRAY", remarks: ["NO PATTERN WORK", "Flight plan required", "Separate ground and tower frequencies"], notams: ["EVENT", "Training event", "Simulated low visibility", "Custom notice"]};
  const before = structuredClone(draft), normalized = currentAtisOptions(draft);
  assert.equal(normalized.letter, "X-RAY");
  assert.deepEqual(normalized.remarks, ["No pattern work", "FPL Rqd", "Mult. Freq. In Use"]);
  assert.deepEqual(normalized.notams, ["Event", "Low visibility", "Custom notice"]);
  assert.deepEqual(draft, before);
});
