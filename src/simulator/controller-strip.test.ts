import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {controllerStripText} from "./controller-strip";
import {engineFor, applyEnvelope, advance, autoReadbacks, restoreExercise} from "./engine";
import {getAirport} from "./airports";
import type {Instruction, Message, RadarEnvironment, Action, Exercise} from "./model";
import {controllerAircraft} from "./controller-state";
import {radarFlightLabel} from "./radar";
import {exerciseSchema} from "./protocol";
import {aircraftLabel} from "./aircraft-label";
import {withFixedReadbackDelay} from "./test-exercise";

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
  const a = aircraft(); a.assigned = {expected: "ils"}; a.arrivalProcedure = "BEACH4 · 22S";
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

const act=(state:Exercise,action:Action)=>{const r=applyEnvelope(state,{id:crypto.randomUUID(),time:0,action});assert.equal(r.error,undefined);return r.state;};

const fixture=()=>engineFor({trainingStation:"EGPH:approach"}).initialExercise();

for (const station of ["approach", "center"] as const) for (const type of ["ils", "gps", "visual"] as const) for (const automatic of [false, true]) for (const heading of [undefined, 90]) {
  test(`${station} ${type} missed approach retains expectation, Automatic ${automatic}, heading ${heading}`, () => {
    let state = withFixedReadbackDelay(engineFor({trainingStation: `EGPH:${station}`}).initialExercise());
    state.running = true; state.autoReadback = automatic;
    const a = state.aircraft[0], airport = getAirport(state);
    const approach = state.radarEnvironment!.approaches.find(p => p.type === type && p.runway === "24")!;
    state = act(state, {kind: "maneuver", aircraftId: a.id, command: {type: "expect-approach", approachId: approach.id}});
    Object.assign(state.aircraft[0].radar!, {navigation: "approach", cleared: approach.id, captured: true, localizer: true, glideslope: true});
    const expected = {runway: approach.runway, additionalInfo: `${type === "visual" ? "VIS" : type.toUpperCase()} - ${airport.icao}`};
    const checkDisplay = () => {
      assert.deepEqual(controllerStripText(state.aircraft[0], airport, state.radarEnvironment!, state.messages), expected);
      assert.equal(aircraftLabel(state.aircraft[0], airport, station, state.radarEnvironment, state.messages).additional, `${expected.additionalInfo} ${expected.runway}`);
      assert.equal(controllerAircraft(state.aircraft[0]).radar!.expected, approach.id);
    };
    checkDisplay();
    state = act(state, {kind: "command", aircraftId: a.id, frequency: station, text: "", command: {type: "missed-approach", altitude: {unit: "feet", value: 6000}, ...(heading === undefined ? {} : {heading})}});
    checkDisplay();
    assert.equal(controllerAircraft(state.aircraft[0]).radar!.cleared, undefined);
    assert.equal(state.aircraft[0].radar!.cleared, approach.id, "pilot waits for readback");
    if (automatic) state = autoReadbacks(advance(state, 1.5), 1500, randomUUID);
    else state = act(state, {kind: "pilot", aircraftId: a.id, text: "Readback", replyTo: state.messages.at(-1)!.id, assign: true});
    state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    checkDisplay();
    const r = state.aircraft[0].radar!;
    assert.equal(r.navigation, "missed"); assert.equal(r.cleared, undefined);
    assert.equal(r.captured, false); assert.equal(r.localizer, false); assert.equal(r.glideslope, false);
    state = act(state, {kind: "maneuver", aircraftId: a.id, command: {type: "vector", heading: 180}});
    checkDisplay();
    const replacement = state.radarEnvironment!.approaches.find(p => p.type === type && p.runway !== approach.runway)!;
    state = act(state, {kind: "maneuver", aircraftId: a.id, command: {type: "expect-approach", approachId: replacement.id}});
    assert.equal(controllerStripText(state.aircraft[0], airport, state.radarEnvironment!, state.messages).runway, replacement.runway);
  });
}

test("missed approach retains radar-vector strip guidance and runway while leaving a hold", () => {
  const a = aircraft();
  const messages = [message({type: "expect-approach", approachId: null, vectors: true, runway: "02"}),
    message({type: "atc", action: "hold", altitude: {unit: "feet", value: 5000}}),
    message({type: "missed-approach", altitude: {unit: "feet", value: 6000}})];
  assert.deepEqual(controllerStripText(a, airport, environment, messages), {runway: "02", additionalInfo: "RV - PHOG"});
});

test("sending updates controller assignments before pilot movement and survives JSON",()=>{
 let state=fixture();state.autoReadback=false;const a=state.aircraft[0],heading=a.targetHeading;
 state=act(state,{kind:"command",aircraftId:a.id,frequency:"approach",text:"",command:{type:"vector",heading:90,altitude:{unit:"feet",value:6000}}});
 assert.equal(state.aircraft[0].targetHeading,heading);assert.equal(state.aircraft[0].radar?.targetAltitude,undefined);
 assert.equal(state.aircraft[0].assigned?.altitude?.value,6000);assert.match(radarFlightLabel(state.aircraft[0],getAirport(state),state.radarEnvironment).flight,/60/);
 state=exerciseSchema.parse(JSON.parse(JSON.stringify(state)));assert.equal(controllerAircraft(state.aircraft[0]).radar?.targetAltitude?.value,6000);
});

test("cancelling expected approach persists a null controller assignment",()=>{
 let state=fixture();const a=state.aircraft[0],p=state.radarEnvironment!.approaches[0];
 state=act(state,{kind:"maneuver",aircraftId:a.id,command:{type:"expect-approach",approachId:p.id}});
 state=act(state,{kind:"command",aircraftId:a.id,frequency:"approach",text:"",command:{type:"expect-approach",approachId:null,vectors:true,runway:"24"}});
 const restored=exerciseSchema.parse(JSON.parse(JSON.stringify(state)));assert.equal(restored.aircraft[0].radar?.expected,p.id);assert.equal(controllerAircraft(restored.aircraft[0]).radar?.expected,undefined);assert.match(radarFlightLabel(restored.aircraft[0],getAirport(),restored.radarEnvironment).approach!,/^RV/);
});
