import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {aviationSpeech, radioMessageText} from "./radio-audio";
import {engineFor, autoReadbacks} from "./engine";
import {catalogFor} from "./catalog";
import {frequenciesFor, getAirport, airportList, airportCallsign} from "./airports";

for (const [number, spoken] of [[4000, "four thousand"], [17500, "seventeen thousand five hundred"], [14500, "fourteen thousand five hundred"], [600, "six hundred"], [0, "zero"]] as const) {
  test(`feet altitude ${number} has cardinal speech in check-ins, instructions and readbacks`, () => {
    for (const prefix of ["with you at", "climb and maintain", "descend to", "maintain", "altitude", "hold present position at", "at or above"]) assert.equal(aviationSpeech(`${prefix} ${number}`), `${prefix} ${spoken}`);
    assert.equal(aviationSpeech(`${number} feet`), `${spoken} feet`);
  });
}

test("flight levels, runway sides and frequencies retain digits; unrelated values are not feet", () => {
  assert.equal(aviationSpeech("FL260, flight level 180, runway 09L, on right base 24R, 121.805"), "flight level two six zero, flight level one eight zero, Runway zero nine left, on right base two four right, one two one decimal eight zero five");
  assert.equal(aviationSpeech("maintain 250 knots, heading 240, wind 240 at 10, QNH 1001"), "maintain two five zero knots, heading two four zero, wind two four zero at one zero, Q-N-H one zero zero one");
  assert.equal(aviationSpeech("Fly heading 90, then heading 035"), "Fly heading zero nine zero, then heading zero three five");
  assert.equal(aviationSpeech("descend and maintain 4,500 feet"), "descend and maintain four thousand five hundred feet");
});

test("compact airline names, leading zeros, phonetic flight suffixes and registrations are distinct", () => {
  for (const [callsign, spoken] of [["Speedbird104", "Speedbird one zero four"], ["Air104", "Air one zero four"], ["Speedbird 104", "Speedbird one zero four"], ["Ryanair7VK", "Ryanair seven Victor Kilo"], ["Ryanair 7VK", "Ryanair seven Victor Kilo"], ["Easy A12B Heavy", "Easy Alpha one two Bravo Heavy"], ["KLM001", "K-L-M zero zero one"], ["N714KG", "November seven one four Kilo Golf"], ["G-ABCD", "Golf Alpha Bravo Charlie Delta"]]) {
    assert.equal(aviationSpeech(`${callsign}, with you at 4000`, [callsign]), `${spoken}, with you at four thousand`);
  }
});

test("manual and automatic radar check-ins remain single purpose for arrivals and departures", () => {
  for (const station of ["approach", "center"] as const) for (const flight of ["return", "departure"] as const) {
    const state = engineFor({trainingStation: `EGPH:${station}`}).initialExercise();
    state.running = state.autoReadback = true;
    const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.altitude = 4000; a.radar!.report = "check-in";
    a.radar!.flight = flight;
    const catalog = catalogFor(getAirport(state));
    const display = catalog.pilotRequestText(a, catalog.resolvePilotRequest({requestId: "check-in"})!, a.runway!);
    assert.equal(display, `${frequenciesFor(getAirport(state))[station].name}, Speedbird 1, with you at 4,000ft`);
    const message = autoReadbacks(state, 1000, randomUUID).messages.at(-1)!;
    assert.equal(message.text, display);
    assert.equal(radioMessageText(message, [a.callsign]), `${frequenciesFor(getAirport(state))[station].name}, Speedbird one, with you at four thousand feet`);
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

test("touch-and-go check-ins omit previous actions even with Automatic disabled", () => {
  for (const automatic of [true, false]) {
    const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(); state.running = true; state.autoReadback = automatic;
    const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.altitude = 4000; a.radar!.report = "touch-and-go";
    const next = autoReadbacks(state, 1000, randomUUID);
    assert.equal(next.messages.at(-1)!.text, "Edinburgh Approach, Speedbird 1, with you at 4,000ft");
    assert.equal(next.messages.at(-1)!.request?.id, "check-in");
    assert.equal(next.aircraft[0].radar!.report, undefined);
    assert.equal(autoReadbacks(next, 1100, randomUUID).messages.length, next.messages.length);
  }
});

test("explicit automatic approach reports use the same selected approach wording as manual requests", () => {
  for (const type of ["ils", "gps", "visual"] as const) {
    const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(); state.running = state.autoReadback = true;
    const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.radar!.report = "approach-request";
    a.radar!.requestedApproach = state.radarEnvironment!.approaches.find(p => p.type === type)!.id;
    const next = autoReadbacks(state, 1000, randomUUID), message = next.messages.at(-1)!;
    assert.equal(message.text, `Speedbird 1, requesting ${type === "visual" ? type : type.toUpperCase()} approach at EGPH`);
    assert.equal(message.request?.id, "request-approach");
  }
});

test("Say intentions uses a single approach request even without an explicit flight selector", () => {
  const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(); state.running = state.autoReadback = true;
  const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.radar!.report = "intentions"; delete a.radar!.flight;
  a.radar!.expected = state.radarEnvironment!.approaches.find(p => p.type === "gps")!.id;
  const message = autoReadbacks(state, 1000, randomUUID).messages.at(-1)!;
  assert.equal(message.text, "Speedbird 1, requesting GPS approach at EGPH");
  assert.equal(message.request?.id, "request-approach");
});

test("Say intentions uses a single approach request for the selected procedure", () => {
  const state = engineFor({trainingStation: "EGPH:approach"}).initialExercise(); state.running = state.autoReadback = true;
  const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.radar!.report = "intentions";
  a.radar!.expected = state.radarEnvironment!.approaches.find(p => p.type === "gps")!.id;
  const message = autoReadbacks(state, 1000, randomUUID).messages.at(-1)!;
  assert.equal(message.text, "Speedbird 1, requesting GPS approach at EGPH");
  assert.equal(message.request?.id, "request-approach");
});


test("manual and automatic radar check-ins remain single purpose for arrivals", () => {
  for (const station of ["approach", "center"] as const) {
    const state = engineFor({trainingStation: `EGPH:${station}`}).initialExercise();
    state.running = state.autoReadback = true;
    const a = state.aircraft[0]; a.callsign = "Speedbird 1"; a.altitude = 4000; a.radar!.report = "check-in";
    const catalog = catalogFor(getAirport(state));
    const display = catalog.pilotRequestText(a, catalog.resolvePilotRequest({requestId: "check-in"})!, a.runway!);
    assert.equal(display, `${frequenciesFor(getAirport(state))[station].name}, Speedbird 1, with you at 4,000ft`);
    const message = autoReadbacks(state, 1000, randomUUID).messages.at(-1)!;
    assert.equal(message.text, display);
    assert.equal(radioMessageText(message, [a.callsign]), `${frequenciesFor(getAirport(state))[station].name}, Speedbird one, with you at four thousand feet`);
    assert.equal(message.text, display, "speech normalization cannot change stored display text");
  }
});
