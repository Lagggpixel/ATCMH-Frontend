import {magneticToTrue} from "./magnetic-headings";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor, applyEnvelope, autoReadbacks, advance, readbackText} from "./engine";
import {catalogFor} from "./catalog";
import {getAirport} from "./airports";
import {checkInTransmission} from "./radar";
import {aviationSpeech} from "./radio-audio";
import {weatherCategory} from "./airport-display";
import {EXERCISE_WEATHER, type Action, type Exercise, type Aircraft, type Instruction} from "./model";

for (const mode of ["approach", "center"] as const) test(`${mode}: turn wording matches actual shortest turn, heading rounding and readback`, () => {
  for (const [from, heading, phrase] of [
    [300, 230, "turn left heading 230"],
    [350, 50, "turn right heading 050"],
    [330, 0, "turn right heading 360"],
    [330, 360, "turn right heading 360"],
    [10, 350, "turn left heading 350"],
    [0, 180, "turn left heading 180"],
    [90, 224, "turn right heading 220"],
  ] as const) {
    let state = engineFor({trainingStation: `EGPH:${mode}`}).initialExercise();
    state.running = true; state.autoReadback = true;
    const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.heading = magneticToTrue(from, getAirport(state)); delete a.radar!.report;
    const c = {type: "vector" as const, heading};
    assert.equal(catalogFor(getAirport(state)).instructionText(a, c), `Speedbird 1, ${phrase}`);
    const result = applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: a.id, frequency: mode, command: c, text: "untrusted wording"}});
    assert.equal(result.error, undefined); state = result.state;
    assert.equal(state.messages.at(-1)!.text, `Speedbird 1, ${phrase}`);
    const readback = phrase.replace(/^turn /, "Turn ");
    assert.equal(engineFor(state).readbackText(a.callsign, state.messages.at(-1)!.text, c), `${readback}, Speedbird 1`);
    assert.equal(engineFor(state).readbackText(a.callsign, `Speedbird 1, ${phrase}, climb and maintain 6000`, {...c, altitude: {unit: "feet", value: 6000}}), `${readback}, climb and maintain 6000, Speedbird 1`);
    state = autoReadbacks(advance(state, 1.5), 1500, randomUUID);
    assert.equal(state.messages.at(-1)!.text, `${readback}, Speedbird 1`);
    assert.equal(state.aircraft[0].targetHeading, magneticToTrue(Math.round(heading / 10) * 10 % 360, getAirport(state)));
  }
});

test("manual and automatic check-ins use feet below 18000 and spoken flight levels above", () => {
  for (const [altitude, phrase] of [[4000, "4,000ft"], [17500, "17,500ft"], [18000, "18,000ft"], [35000, "35,000ft"]] as const) {
    const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(); state.running = true; state.autoReadback = true;
    const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.altitude = altitude; a.radar!.flight = "departure";
    const expected = `Speedbird 1, with you at ${phrase}`, catalog = catalogFor(getAirport(state));
    assert.equal(checkInTransmission(a), expected);
    assert.equal(catalog.pilotRequestText(a, catalog.resolvePilotRequest({requestId: "check-in"})!, "06"), `Edinburgh Approach, ${expected}`);
    assert.equal(autoReadbacks(state, 1000, randomUUID).messages.at(-1)!.text, `Edinburgh Approach, ${expected}`);
  }
});

test("approach requests display compact initialisms and ICAO codes, and speak airport names", () => {
  for (const airport of ["EGPH", "EGLL"]) {
    const state = engineFor({airport, trainingStation: `${airport}:approach`}).initialExercise(), a = state.aircraft[0]; a.callsign = "Speedbird 1";
    const catalog = catalogFor(getAirport(state)), request = catalog.resolvePilotRequest({requestId: "request-approach"})!;
    const destination = airport === "EGPH" ? "Edinburgh" : "Heathrow";
    assert.equal(catalog.pilotRequestText(a, request, a.runway!, false, {exercise: state}), `Speedbird 1, requesting ILS approach at ${airport}`);
    for (const [type, phrase] of [["ils", "ILS"], ["gps", "GPS"], ["visual", "visual"]] as const) {
      const approach = state.radarEnvironment!.approaches.find(p => p.type === type)!;
      approach.id = `custom-${type}`; a.radar!.expected = approach.id;
      const display = catalog.pilotRequestText(a, request, a.runway!, false, {exercise: state});
      assert.equal(display, `Speedbird 1, requesting ${phrase} approach at ${airport}`);
      assert.equal(aviationSpeech(display, [a.callsign]), `Speedbird one, requesting ${phrase === "visual" ? phrase : phrase.split("").join("-")} approach at ${destination}`);
    }
  }
});

test("calm clearances and routed taxiway speech use the correct words", () => {
  const e = engineFor({airport: "KDAL"}), a = e.newAircraft("words", true), ap = getAirport({airport: "KDAL"});
  const catalog = catalogFor(ap, undefined, {...EXERCISE_WEATHER, windDirection: 0, windSpeed: 0, windGust: 0});
  for (const command of [{type: "land"}, {type: "takeoff"}] as const) assert.match(catalog.instructionText(a, command), /wind calm/);
  assert.match(aviationSpeech("Taxi to runway 31R via C, C1, A, hold short of runway 13L"), /via Charlie, Charlie one, Alpha, hold short/);
  assert.match(aviationSpeech("Turn left next taxiway B2"), /taxiway Bravo two/);
  assert.equal(weatherCategory({...EXERCISE_WEATHER, visibilityKm: 16, rawMetar: "KDAL 241200Z 00000KT 10SM FEW020 SCT080"}), "VFR");
});

const fixture=()=>engineFor({trainingStation:"EGPH:approach"}).initialExercise();

test("Tower inbound call retains choices, ATIS, position and landing intention",()=>{
 const a=engineFor().newAircraft("a",true),state=engineFor().initialExercise();state.publishedDraft={...state.atis,letter:"BRAVO"};
 const c=catalogFor(),request=c.resolvePilotRequest({requestId:"inbound-option"})!;
 assert.match(c.pilotRequestText(a,request,"24",false,{exercise:state}),/is .* miles to the .* inbound for Touch and Go with information BRAVO/);
 assert.match(c.pilotRequestText(a,request,"24",false,{inbound:"ils",exercise:state}),/inbound on the ILS for Touch and Go Runway 24 with information BRAVO/);
 assert.match(c.pilotRequestText(a,request,"24",false,{inbound:"runway",exercise:state}),/requesting Runway 24$/);
});

test("IFR check-in rounds feet, addresses facility and includes arrival state",()=>{
 const state=fixture(),a=state.aircraft[0];a.altitude=30049;a.arrivalProcedure="OCK1F";
 const c=catalogFor(),r=c.resolvePilotRequest({requestId:"check-in"})!;assert.match(c.pilotRequestText(a,r,"24"),/Approach, .*with you at 30,000ft, descending via OCK1F arrival$/);
});

const actForTrainerImprovements = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
};

const kdal = getAirport({airport: "KDAL"}), engine = engineFor({airport: "KDAL"}), catalog = catalogFor(kdal);

const stateOf = (aircraft: Aircraft[]): Exercise => ({...engine.initialExercise(), aircraft, running: true});

test("inbound and runway-change requests use current location, altitude and published ATIS", () => {
  const a = {...engine.newAircraft("a", true), callsign: "N714KG", position: {x: Math.SQRT1_2 * 5, y: -Math.SQRT1_2 * 5}, altitude: 1500};
  const state = stateOf([a]); state.publishedDraft = {...state.atis, letter: "X"};
  const request = catalog.resolvePilotRequest({requestId: "inbound-option"})!;
  assert.equal(catalog.pilotRequestText(a, request, "31R", false, {exercise: state}), "Dallas Tower, N714KG is 5 miles to the southeast at 1500 feet, inbound for Touch and Go with information X, requesting Runway 31R");
  const sent = actForTrainerImprovements(state, {kind: "pilot", aircraftId: a.id, text: "stale preview", request: {id: "inbound-option", runway: "31R"}});
  assert.equal(sent.messages.at(-1)!.text, catalog.pilotRequestText(a, request, "31R", false, {exercise: state}));
  assert.equal(catalog.pilotRequestText(a, request, "31R").includes("information"), false);
  const change = catalog.resolvePilotRequest({requestId: "runway-change"})!;
  assert.equal(catalog.pilotRequestText({...a, callsign: "American 2154"}, change, "31L"), "American 2154, requesting change to runway 31L");
});

test("taxi and all exit variants have the requested command, readback and spoken runway wording", () => {
  const a = {...engine.newAircraft("a", false), callsign: "N714KG"};
  const taxi: Instruction = {type: "taxi", runway: "22"};
  const text = catalog.instructionText(a, taxi);
  assert.equal(text, "N714KG, taxi to runway 22, contact tower when ready");
  assert.equal(readbackText(a.callsign, text, taxi), "Taxi to runway 22, N714KG");
  assert.match(aviationSpeech(text), /Runway two two/);
  assert.equal(aviationSpeech("N714KG is on right downwind 31R, full stop"), "N714KG is on right downwind three one right, full stop");
  for (const side of ["left", "right", "any"] as const) {
    const instruction: Instruction = {type: "exit-runway", side};
    const prefix = side === "any" ? "exit runway when able" : `when able turn ${side}`;
    assert.equal(catalog.instructionText({...a, callsign: "Delta 64"}, instruction), `Delta 64, ${prefix}, contact ground on the taxiway`);
    assert.match(catalog.instructionText(a, {...instruction, expedite: true, traffic: "final"}), /and contact ground, please expedite, traffic on final$/);
  }
});
