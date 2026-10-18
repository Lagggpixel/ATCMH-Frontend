import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {catalogFor, type MenuEntry} from "./catalog";
import {engineFor} from "./engine";
import {getAirport} from "./airports";
import {ALTITUDES, altitudeFeet} from "./radar";
import {KNOT_SPEEDS_HIGH, MACH_SPEEDS} from "./radar-speed";
import {exerciseSchema, instructionSchema} from "./protocol";
import {pendingCommands, type Instruction, type Message} from "./model";

const find = (entries: MenuEntry[], ...labels: string[]): MenuEntry => {
  const entry = entries.find(e => e.label === labels[0]); assert.ok(entry, labels.join(" / "));
  return labels.length === 1 ? entry : find(entry.children ?? [], ...labels.slice(1));
};
test("reference clearances have distinct pilot wording, rather than controller echoes", () => {
  const e = engineFor(), catalog = catalogFor(), a = {...e.newAircraft("reference", true), callsign: "Speedbird 1"};
  const cases: [Instruction, string, string][] = [
    [{type: "taxi", runway: "24", contactTowerWhenReady: true}, "Speedbird 1, taxi to runway 24, contact tower when ready", "Taxi to runway 24, Speedbird 1"],
    [{type: "stop"}, "Speedbird 1, hold position", "Holding position, Speedbird 1"],
    [{type: "hold-short", runway: "24", ground: true}, "Speedbird 1, hold short of runway 24", "Hold short of runway 24, Speedbird 1"],
    [{type: "hold-short", runway: "24"}, "Speedbird 1, hold short of runway 24", "Holding short runway 24, Speedbird 1"],
    [{type: "lineup", runway: "24"}, "Speedbird 1, line up and wait runway 24", "Line up and wait runway 24, Speedbird 1"],
    [{type: "takeoff", runway: "24", hand: "left", immediate: true}, "Speedbird 1, wind 240 at 10, runway 24, cleared for immediate takeoff, make left traffic", "Cleared for takeoff, runway 24, Speedbird 1"],
    [{type: "land", runway: "24", number: 2, option: true, hand: "left"}, "Speedbird 1, wind 240 at 10, number 2, runway 24, cleared for the option, after the option, make left traffic", "Number 2, cleared for the option, runway 24, Speedbird 1"],
    [{type: "extend", leg: "downwind"}, "Speedbird 1, extend downwind, I'll call your base", "You'll call my base, Speedbird 1"],
    [{type: "extend", leg: "upwind"}, "Speedbird 1, extend upwind, I'll call your crosswind", "Extending upwind, Speedbird 1"],
    [{type: "go-around", runway: "24", hand: "right"}, "Speedbird 1, go around, make right traffic runway 24", "Going around, make right traffic runway 24, Speedbird 1"],
    [{type: "go-around", runway: "24", hand: "right", response: true}, "Speedbird 1, roger, make right traffic runway 24", "Roger, Speedbird 1"],
    [{type: "sequence", number: 2, traffic: "Left Base"}, "Speedbird 1, number 2, traffic to follow is on left base", "Number 2, behind the traffic on left base, Speedbird 1"],
    [{type: "exit-runway", side: "left", expedite: true, traffic: "final"}, "Speedbird 1, when able turn left and contact ground, please expedite, traffic on final", "Wilco, Speedbird 1"],
    [{type: "transition", altitude: 5000}, "Speedbird 1, Transition approved at or above 5000 feet", "Transition approved at 5000 feet, Speedbird 1"],
    [{type: "frequency", frequency: null, from: "approach"}, "Speedbird 1, radar services terminated, frequency change approved, good day!", "Frequency change approved Speedbird 1, good day!"],
  ];
  for (const [instruction, controller, pilot] of cases) {
    assert.equal(catalog.instructionText(a, instruction), controller);
    assert.equal(e.readbackText(a.callsign, controller, instruction), pilot);
  }
});
test("Ground and Tower paths follow Send, immediate and Confirm terminals", () => {
  const e = engineFor(), a = e.newAircraft("ground", false), catalog = catalogFor();
  const ground = catalog.messageMenu("ground", a);
  assert.equal(find(ground, "Taxi to...", "Runway 24").instruction?.type, "taxi");
  assert.equal(find(ground, "Pushback Approved", "Send").instruction?.type, "pushback");
  assert.equal(find(ground, "Pushback Approved", "Runway 06", "Tail to the West").instruction?.type, "pushback");
  assert.deepEqual(find(ground, "Cross Runway...", "Runway 24", "Expedite").instruction, {type: "cross", runway: "24", expedite: true});
  assert.ok(!ground.some(e => e.label === "Tow Approved"));
  assert.equal(find(ground, "Ask for Intentions", "Confirm?").instruction?.type, "radio");
  const tower = catalog.messageMenu("tower", {...a, frequency: "tower"});
  assert.equal(find(tower, "Line up and Wait", "Runway 24").instruction?.type, "lineup");
  assert.equal(find(tower, "Cleared for Takeoff", "Runway 24", "Make Left Traffic", "Send").instruction?.type, "takeoff");
  assert.equal(find(tower, "Back Taxi", "Runway 24", "Contact ground when off the runway", "Expedite").instruction?.type, "atc");
  assert.equal(find(tower, "Exit runway", "Right", "Hold Short", "Runway 06", "Send").instruction?.type, "exit-runway");
  assert.ok(!find(tower, "Request Speed").children?.some(e => e.label === "Maintain Speed"));
});
test("radar choices match the reference bounds and assigned-approach clearance branches", () => {
  const e = engineFor({trainingStation: "EGPH:approach"}), state = e.initialExercise(), a = state.aircraft[0], catalog = catalogFor(getAirport(state), state.radarEnvironment);
  assert.ok(ALTITUDES.some(a => altitudeFeet(a) === 17000)); assert.ok(!ALTITUDES.some(a => altitudeFeet(a) === 17500));
  assert.deepEqual([KNOT_SPEEDS_HIGH[0], KNOT_SPEEDS_HIGH.at(-1)], [260, 400]); assert.deepEqual([MACH_SPEEDS[0], MACH_SPEEDS.at(-1)], [.53, .99]);
  a.radar!.expected = "ils-24"; a.altitude = 3000;
  const menu = catalog.messageMenu("approach", a);
  const clearance = find(menu, "Vectoring Instructions", "Altitude", "< 10,000ft", "3000", "Cleared ILS", "Runway 24").instruction!;
  const text = catalog.instructionText(a, clearance);
  assert.match(text, /maintain 3000 until established on the localizer, cleared ILS runway 24 approach$/);
  assert.match(e.readbackText(a.callsign, text, clearance), /cleared ILS runway 24, Speedbird 124$/);
  const standalone = find(menu, "Clear for Approach", "Runway 24").instruction!;
  assert.equal(e.readbackText(a.callsign, catalog.instructionText(a, standalone), standalone), "Maintain 3000 until established on the localizer, cleared ILS runway 24, Speedbird 124");
  assert.equal(find(menu, "Request Speed", "Maintain Speed", "> 250 kts", "400kts", "Or Below").instruction?.type, "radar-speed");
  assert.equal(find(menu, "Missed Approach Instructions", "Altitude and Heading", "< 10,000ft", "4000", "360").instruction?.type, "missed-approach");
});
test("request-only radar replies appear for the appropriate pilot request", () => {
  const e = engineFor({trainingStation: "EGPH:center"}), state = e.initialExercise(), a = state.aircraft[0], c = catalogFor(getAirport(state), state.radarEnvironment);
  const request = (text: string): Message => ({id: "request", aircraftId: a.id, sender: "pilot", frequency: "center", time: 0, text});
  assert.ok(!c.requestMessageMenu("center", a).some(e => e.label === "Radar Contact"));
  for (const [text, label] of [["with you at 3000", "Radar Contact"], ["requesting flight following", "Respond to Flight Following Request"], ["requesting radar vectors", "Respond to Radar Vectors Request"], ["requesting diversion", "Respond to Diversion Request"], ["minimum fuel", "Respond to Emergency"]]) assert.ok(c.requestMessageMenu("center", a, request(text)).some(e => e.label === label), label);
});
test("STAR descent menu follows route availability in Approach and Center", () => {
  for (const frequency of ["approach", "center"] as const) {
    const e = engineFor({trainingStation: `EGPH:${frequency}`}), state = e.initialExercise(), a = state.aircraft[0];
    const airport = getAirport(state), catalog = catalogFor(airport, state.radarEnvironment);
    const option = () => catalog.messageMenu(frequency, a).find(entry => entry.instruction?.type === "atc" && entry.instruction.action === "star-descent");
    a.radar!.routeIndex = 0;
    a.flightPlan = [{x: 0, y: 5, altitude: 4000}, {x: 0, y: 0}];
    delete a.arrivalProcedure;
    assert.equal(option(), undefined, "no STAR");
    a.arrivalProcedure = "TRAIN1";
    assert.equal(option()?.label, "Request Descent via TRAIN1 STAR");
    a.radar!.routeIndex = 1;
    assert.equal(option(), undefined, "no remaining altitude constraints");
    a.flightPlan[1].altitude = 3000;
    assert.ok(option(), "remaining constraint restores the option");
    a.flightPlan[1].altitude = airport.elevation;
    assert.equal(option(), undefined, "constraint at airport elevation");
    a.flightPlan[1].altitude = 17500;
    assert.equal(option(), undefined, "unsupported altitude");
    a.flightPlan = [];
    assert.equal(option(), undefined, "empty route");
    a.flightPlan = [{x: 0, y: 0}];
    a.radar!.routeIndex = 0;
    assert.equal(option(), undefined, "route without altitude constraints");
  }
});
test("new menu instructions survive protocol serialization", () => {
  for (const frequency of ["ground", "tower", "approach", "center"] as const) {
    const e = engineFor(frequency === "ground" || frequency === "tower" ? {} : {trainingStation: `EGPH:${frequency}`}), state = e.initialExercise();
    for (const a of state.aircraft) {
      a.frequency = frequency;
      const visit = (entries: MenuEntry[]) => {for (const entry of entries) {if (entry.instruction) assert.ok(instructionSchema.safeParse(entry.instruction).success, JSON.stringify(entry)); if (entry.children) visit(entry.children);}};
      visit(catalogFor(getAirport(state), state.radarEnvironment).messageMenu(frequency, a));
    }
  }
});
test("holds persist, predictions do not mutate history, and a vector exits the hold", () => {
  const e = engineFor({trainingStation: "EGPH:approach"}); let state = e.initialExercise(); state.running = true;
  const a = state.aircraft[0]; a.altitude = 4000;
  const command: Instruction = {type: "atc", action: "hold", hand: "left", altitude: {unit: "feet", value: 4000}};
  state = e.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: a.id, command}}).state;
  const before = JSON.stringify(state); e.predictAircraft(state.aircraft, 10); assert.equal(JSON.stringify(state), before);
  state = e.advance(state, 10); assert.ok(state.aircraft[0].atcManeuver); assert.ok(state.aircraft[0].bankAngle! < 0);
  assert.ok(exerciseSchema.safeParse(state).success);
  state = e.applyEnvelope(state, {id: randomUUID(), time: 1, action: {kind: "maneuver", aircraftId: a.id, command: {type: "vector", heading: 180}}}).state;
  assert.equal(state.aircraft[0].atcManeuver, undefined);
});
test("bookmarks and no-readback commands do not manufacture pilot acknowledgements", () => {
  const e = engineFor(); let state = e.initialExercise(); const a = state.aircraft[0];
  state = e.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: a.id, frequency: "tower", command: {type: "atc", action: "bookmark"}, text: ""}}).state;
  assert.equal(state.bookmarks?.length, 1); assert.equal(state.messages.length, 0); assert.ok(exerciseSchema.safeParse(state).success);
  state = e.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "command", aircraftId: a.id, frequency: "tower", command: {type: "atc", action: "broadcast", text: "Check ATIS frequency for airport information."}, text: "Attention all aircraft, Check ATIS frequency for airport information."}}).state;
  assert.deepEqual(pendingCommands(state, a.id), []);
});

test("historical altitude targets and transmissions survive the corrected choice grid", () => {
  const e = engineFor({trainingStation: "EGPH:approach"}), state = e.initialExercise();
  state.aircraft[0].radar!.targetAltitude = {unit: "feet", value: 17500};
  const instruction: Instruction = {type: "vector", altitude: {unit: "feet", value: 17500}};
  state.messages = [{id: "historical", aircraftId: state.aircraft[0].id, time: 0, sender: "controller", frequency: "approach", text: "Historical wording", instruction}];
  assert.ok(exerciseSchema.safeParse(state).success);
  assert.equal(instructionSchema.safeParse(instruction).success, false);
});

test("the highlighted reply to a pilot go-around uses roger and the dedicated acknowledgement", () => {
  const e = engineFor(), a = e.newAircraft("go", true), c = catalogFor();
  const request: Message = {id: "go-request", aircraftId: a.id, time: 0, sender: "pilot", frequency: "tower", text: "Speedbird 124, going around", request: {id: "go-around", runway: "24"}};
  const menu = c.requestMessageMenu("tower", a, request);
  assert.equal(menu[0].label, "Respond to Go Around"); assert.equal(menu[0].suggested, true);
  const instruction = find([menu[0]], "Respond to Go Around", "Make Left Traffic", "Runway 24").instruction!;
  assert.equal(c.instructionText(a, instruction), "Speedbird 124, roger, make left traffic runway 24");
  assert.equal(e.readbackText(a.callsign, c.instructionText(a, instruction), instruction), "Roger, Speedbird 124");
});

test("ILS flight-level readbacks and level missed-approach replies retain the reference exceptions", () => {
  const e = engineFor();
  assert.equal(e.readbackText("Speedbird 1", "Speedbird 1, cleared ILS runway 24 approach", {type: "vector", approachId: "ils-24", standalone: true, interceptAltitude: 19000}), "Maintain FL190 until established on the localizer, cleared ILS runway 24, Speedbird 1");
  assert.equal(e.readbackText("Speedbird 1", "Speedbird 1, execute missed approach, descend and maintain 4000", {type: "missed-approach", altitude: {unit: "feet", value: 4000}, fromAltitude: 4000}), "Executing missed approach, maintain 4000, Speedbird 1");
});
