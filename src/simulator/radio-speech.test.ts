import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {aviationSpeech, radioMessageText} from "./radio-audio";
import {engineFor, autoReadbacks} from "./engine";
import {catalogFor} from "./catalog";
import {getAirport, airportList, airportCallsign} from "./airports";

for (const [number, spoken] of [[4000, "four thousand"], [17500, "seventeen thousand five hundred"], [14500, "fourteen thousand five hundred"], [600, "six hundred"], [0, "zero"]] as const) {
  test(`feet altitude ${number} has cardinal speech in check-ins, instructions and readbacks`, () => {
    for (const prefix of ["with you at", "climb and maintain", "descend to", "maintain", "altitude", "hold present position at", "at or above"]) assert.equal(aviationSpeech(`${prefix} ${number}`), `${prefix} ${spoken}`);
    assert.equal(aviationSpeech(`${number} feet`), `${spoken} feet`);
  });
}

test("flight levels, runway sides and frequencies retain digits; unrelated values are not feet", () => {
  assert.equal(aviationSpeech("FL260, flight level 180, runway 09L, on right base 24R, 121.805"), "flight level two six zero, flight level one eight zero, Runway zero nine left, on right base two four right, one two one decimal eight zero five");
  assert.equal(aviationSpeech("maintain 250 knots, heading 240, wind 240 at 10, QNH 1001"), "maintain 250 knots, heading 240, wind 240 at 10, Q-N-H 1001");
  assert.equal(aviationSpeech("descend and maintain 4,500 feet"), "descend and maintain four thousand five hundred feet");
});

test("compact airline names, leading zeros, phonetic flight suffixes and registrations are distinct", () => {
  for (const [callsign, spoken] of [["Speedbird104", "Speedbird one zero four"], ["Air104", "Air one zero four"], ["Speedbird 104", "Speedbird one zero four"], ["Ryanair7VK", "Ryanair seven Victor Kilo"], ["Ryanair 7VK", "Ryanair seven Victor Kilo"], ["Easy A12B Heavy", "Easy Alpha one two Bravo Heavy"], ["KLM001", "K-L-M zero zero one"], ["N714KG", "November seven one four Kilo Golf"], ["G-ABCD", "Golf Alpha Bravo Charlie Delta"]]) {
    assert.equal(aviationSpeech(`${callsign}, with you at 4000`, [callsign]), `${spoken}, with you at four thousand`);
  }
});

test("manual and automatic radar check-ins remain single purpose for arrivals", () => {
  for (const station of ["approach", "center"] as const) {
    const state = engineFor({trainingStation: `EGPH:${station}`}).initialExercise();
    state.running = state.autoReadback = true;
    const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.altitude = 4000; a.radar!.report = "check-in";
    const catalog = catalogFor(getAirport(state));
    const display = catalog.pilotRequestText(a, catalog.resolvePilotRequest({requestId: "check-in"})!, a.runway!);
    assert.equal(display, "Speedbird 1, with you at 4000");
    const message = autoReadbacks(state, 1000, randomUUID).messages.at(-1)!;
    assert.equal(message.text, display);
    assert.equal(radioMessageText(message, [a.callsign]), "Speedbird one, with you at four thousand");
    assert.equal(message.text, display, "speech normalization cannot change stored display text");
  }
});

test("all supported airport identifiers are spoken by radio name while approach display retains ICAO", () => {
  for (const airport of airportList) {
    assert.equal(aviationSpeech(`requesting ILS approach at ${airport.icao}`), `requesting I-L-S approach at ${airportCallsign(airport)}`);
  }
  assert.equal(aviationSpeech("requesting GPS approach at EGPH"), "requesting G-P-S approach at Edinburgh");
  assert.equal(aviationSpeech("requesting visual approach at EGPH"), "requesting visual approach at Edinburgh");
});

test("Say intentions uses a single approach request for the selected procedure", () => {
  const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(); state.running = state.autoReadback = true;
  const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.radar!.report = "intentions";
  a.radar!.expected = state.radarEnvironment!.approaches.find(p => p.type === "gps")!.id;
  const message = autoReadbacks(state, 1000, randomUUID).messages.at(-1)!;
  assert.equal(message.text, "Speedbird 1, requesting GPS approach at EGPH");
  assert.equal(message.request?.id, "request-approach");
});
