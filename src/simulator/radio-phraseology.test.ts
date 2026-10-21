import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor, applyEnvelope, autoReadbacks, advance} from "./engine";
import {catalogFor} from "./catalog";
import {getAirport} from "./airports";
import {checkInTransmission} from "./radar";
import {aviationSpeech} from "./radio-audio";

for (const mode of ["approach", "center"] as const) test(`${mode}: turn wording matches actual shortest turn, heading rounding and readback`, () => {
  for (const [from, heading, phrase] of [
    [300, 230, "turn left heading two three zero"],
    [350, 50, "turn right heading zero five zero"],
    [330, 0, "turn right heading three six zero"],
    [330, 360, "turn right heading three six zero"],
    [10, 350, "turn left heading three five zero"],
    [0, 180, "turn left heading one eight zero"],
    [90, 224, "turn right heading two two zero"],
  ] as const) {
    let state = engineFor({trainingStation: `EGPH:${mode}`}).initialExercise();
    state.running = true; state.autoReadback = true;
    const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.heading = from; delete a.radar!.report;
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
    assert.equal(state.aircraft[0].targetHeading, Math.round(heading / 10) * 10 % 360);
  }
});
test("manual and automatic check-ins use feet below 18000 and spoken flight levels above", () => {
  for (const [altitude, phrase] of [[4000, "4000"], [17500, "17500"], [18000, "flight level one eight zero"], [35000, "flight level three five zero"]] as const) {
    const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(); state.running = true; state.autoReadback = true;
    const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.altitude = altitude;
    const expected = `Speedbird 1, with you at ${phrase}`, catalog = catalogFor(getAirport(state));
    assert.equal(checkInTransmission(a), expected);
    assert.equal(catalog.pilotRequestText(a, catalog.resolvePilotRequest({requestId: "check-in"})!, "06"), expected);
    assert.equal(autoReadbacks(state, 1000, randomUUID).messages.at(-1)!.text, expected);
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
