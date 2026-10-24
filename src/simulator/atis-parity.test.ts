import test from "node:test";
import assert from "node:assert/strict";
import {ATIS_REMARKS, ATIS_NOTAMS, atisFrequencies, atisRunwayWind, currentAtisOptions} from "./atis-options";
import {applyEnvelope, engineFor, initialExercise} from "./engine";
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

test("generated ATIS rounds weather and follows IF's complete broadcast element order", () => {
  const state = initialExercise();
  state.weather = {...EXERCISE_WEATHER, visibilityKm: 9.7, temperature: 18.6, dewpoint: 9.2, rawMetar: "RAW METAR"};
  state.radarEnvironment = {...radarEnvironmentFor(airport), facilities: [facility("one"), facility("two")]};
  state.atis = {...state.atis, arrivals: ["24"], departures: ["06"], expectations: ["ILS"],
    remarks: ["No pattern work"], notams: ["Event"], procedures: ["TWEED3A\nSTAR", "TLA1A\nSID"],
    frequencyAssignments: [{facilityId: "one", directions: ["North"]}]};
  const before = structuredClone(state);
  const published = engineFor(state).applyEnvelope(state, {id: "publish-order", time: 0, action: {kind: "publish-atis"}});
  assert.equal(published.error, undefined);
  const elements = ["information ALPHA", "Wind ", "Visibility 10 kilometres.", "Temperature 19 degrees Celsius.",
    "Dew Point 9 degrees Celsius.", "QNH ", "Remarks, no pattern work.", "Landing runway 24.", "Expect ILS approach.",
    "Departing runway 06.", "Notams, event in progress", "Recommended Departure Procedures, TLA1A.",
    "Recommended Arrival Procedures, TWEED3A.", "contact approach on 121.20", "Advise on initial contact"];
  let previous = -1;
  for (const element of elements) {
    const index = published.state.publishedAtis.indexOf(element);
    assert.ok(index > previous, `${element} must follow the preceding element: ${published.state.publishedAtis}`);
    previous = index;
  }
  assert.doesNotMatch(published.state.publishedAtis, /RAW METAR|9\.7|18\.6|9\.2/);
  assert.deepEqual(state, before, "formatting must preserve the source weather and draft");
  assert.deepEqual(published.state.weather, before.weather);
});

test("ATIS rounds signed temperatures and omits unavailable weather and unselected runways", () => {
  for (const [visibilityKm, temperature, dewpoint, expected] of [
    [4.4, -2.6, -8.2, ["Visibility 4 kilometres.", "Temperature -3 degrees Celsius.", "Dew Point -8 degrees Celsius."]],
    [4.5, 2.5, -0.2, ["Visibility 5 kilometres.", "Temperature 3 degrees Celsius.", "Dew Point 0 degrees Celsius."]],
  ] as const) {
    const engine = engineFor({weather: {...EXERCISE_WEATHER, visibilityKm, temperature, dewpoint}});
    const text = engine.atisText(engine.initialExercise().atis);
    for (const element of expected) assert.ok(text.includes(element), text);
  }
  const state = initialExercise();
  const draft = {...state.atis, arrivals: [], departures: [], expectations: ["ILS"]};
  const text = engineFor(state).atisText(draft);
  assert.doesNotMatch(text, /Temperature|Dew Point|Landing runway|Departing runway|Expect ILS/);
  assert.ok(text.includes("Visibility"));
  assert.equal(engineFor(state).atisText({...draft, publicText: "Imported original ATIS 9.7"}), "Imported original ATIS 9.7");
});
