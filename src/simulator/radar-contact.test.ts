import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {catalogFor} from "./catalog";
import {engineFor} from "./engine";
import {getAirport} from "./airports";
import {pendingCommands, pendingPilotMessage, type Exercise} from "./model";
import {exerciseSchema} from "./protocol";
import {blankScenario, createScenarioExercise, seedFromAircraft} from "./scenarios";
import {advanceScenario} from "./scenario-engine";

function fixture(station: "approach" | "center", automatic = true) {
  const engine = engineFor({trainingStation: `EGPH:${station}`});
  const state = engine.initialExercise();
  state.aircraft = [state.aircraft[0]];
  state.aircraft[0].radar!.flight = "departure";
  state.running = true;
  state.autoReadback = automatic;
  return {engine, state, catalog: catalogFor(getAirport(state), state.radarEnvironment)};
}

for (const airport of ["EGPH", "LTFM", "EIDW", "RJTT"]) for (const station of ["approach", "center"] as const) {
  test(`${airport} ${station}: landing arrivals check in once on entry and retune`, () => {
    const engine = engineFor({airport, trainingStation: `${airport}:${station}`});
    let state = engine.initialExercise(); state.aircraft = [engine.newAircraft("arrival", true)]; state.running = true; state.autoReadback = true;
    const a = state.aircraft[0], approach = state.radarEnvironment!.approaches.find(p => p.type === "gps")!;
    a.radar!.requestedApproach = approach.id;
    state = engine.autoReadbacks(state, 1000, randomUUID);
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].request?.id, "check-in");
    assert.ok(state.messages[0].text.includes(`${a.callsign}, with you at `));
    assert.ok(!state.messages[0].text.includes("requesting"));
    assert.equal(state.aircraft[0].radar!.expected, undefined);
    assert.equal(state.aircraft[0].radar!.cleared, undefined);
    assert.equal(engine.autoReadbacks(state, 1001, randomUUID).messages.length, 1);
    for (const frequency of ["tower", station] as const) {
      const result = engine.applyEnvelope(state, {id: randomUUID(), time: 1002, action: {kind: "edit", aircraftId: a.id, patch: {frequency}}});
      assert.equal(result.error, undefined); state = result.state;
    }
    state = engine.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    state = engine.autoReadbacks(state, 1003, randomUUID);
    assert.equal(state.messages.length, 2);
    assert.equal(state.messages[1].request?.id, "check-in");
  });
}

test("scheduled arrivals check in without assigning the filed runway or clearance", () => {
  const definition = blankScenario({airport: "LTFM", trainingStation: "LTFM:approach"});
  const engine = engineFor(definition), a = engine.newAircraft("arrival", true);
  a.runway = null; a.flightPlan = [{x: 0, y: -10, name: "RW35R"}];
  definition.aircraft = [{key: "arrival", initial: false, seed: seedFromAircraft(a)}];
  definition.events = [{id: "spawn", title: "Arrival", trigger: {type: "time", at: 1}, actions: [{type: "spawn", aircraftKey: "arrival"}]}];
  const created = createScenarioExercise(definition, "arrival-test", randomUUID());
  let state = {...created.exercise, running: true, autoReadback: true};
  for (let t = 0; t < 3; t++) state = advanceScenario(state, created.runtime, 1, t * 1000).exercise;
  state = engine.autoReadbacks(state, 3000, randomUUID);
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].request?.id, "check-in");
  assert.match(state.messages[0].text, /, with you at [\d,]+ft$/);
  assert.equal(state.aircraft[0].runway, null);
  assert.equal(state.aircraft[0].radar!.expected, undefined);
  assert.equal(state.aircraft[0].radar!.cleared, undefined);
});

test("onward traffic checks in and manual arrival requests clear the pending entry report", () => {
  const {engine, state} = fixture("approach", false), a = state.aircraft[0];
  delete a.radar!.flight;
  a.destination = {name: "EGLL", point: {x: 100, y: -200}};
  assert.match(engine.autoReadbacks({...state, autoReadback: true}, 1000, randomUUID).messages[0].text, /with you at/);
  a.destination = {name: "EGPH", point: {x: 0, y: 0}};
  assert.equal(engine.autoReadbacks(state, 1000, randomUUID).messages.length, 0);
  const manual = engine.applyEnvelope(state, {id: randomUUID(), time: 1000, action: {kind: "pilot", aircraftId: a.id, text: "", request: {id: "request-approach", runway: a.runway!}}});
  assert.equal(manual.error, undefined);
  assert.equal(manual.state.aircraft[0].radar!.report, undefined);
  assert.equal(engine.autoReadbacks({...manual.state, autoReadback: true}, 1001, randomUUID).messages.length, 1);
});

for (const station of ["approach", "center"] as const) {
  test(`${station}: automatic, manual and legacy check-ins highlight Radar Contact in registration order`, () => {
    const {engine, state, catalog} = fixture(station);
    const automatic = engine.autoReadbacks(state, 1000, randomUUID);
    const a = automatic.aircraft[0];
    const checkIn = pendingPilotMessage(automatic, a.id, station)!;
    assert.ok(checkIn);
    for (const request of [checkIn, {...checkIn, request: {id: "check-in" as const, runway: a.runway!}}]) {
      const menu = catalog.requestMessageMenu(station, a, request);
      const contact = menu.find(entry => entry.label === "Radar Contact")!;
      assert.equal(menu[0].label, "Vectoring Instructions");
      assert.equal(contact.suggested, true);
      assert.equal(menu.filter(entry => entry.label === "Radar Contact").length, 1);
      assert.deepEqual(contact.children?.map(entry => [entry.label, entry.sendLabel, entry.instruction]), [
        ["Send", "SEND", {type: "atc", action: "radar-contact"}],
        ["Send and Ask Approach Request", "NOW", {type: "atc", action: "radar-contact", variant: "request"}],
      ]);
    }
    assert.ok(!catalog.requestMessageMenu(station, a).some(entry => entry.label === "Radar Contact"));
  });

  for (const type of ["ils", "gps", "visual", "default"] as const) {
    for (const automatic of [true, false]) {
      test(`${station}: ask approach requests ${type} once with Automatic ${automatic ? "on" : "off"}`, () => {
        const {engine, state, catalog} = fixture(station, automatic);
        const a = state.aircraft[0];
        // The pilot's intention wins over a different assigned expectation.
        if (type !== "default") {
          a.radar!.requestedApproach = `${type}-24`;
          a.radar!.expected = `${type === "ils" ? "gps" : "ils"}-06`;
          a.radar!.flight = "return";
        }
        let next = engine.applyEnvelope(state, {id: randomUUID(), time: 1000, action: {kind: "pilot", aircraftId: a.id, text: "", request: {id: "check-in", runway: a.runway!}}}).state;
        const checkIn = pendingPilotMessage(next, a.id, station)!;
        const command = catalog.requestMessageMenu(station, a, checkIn).find(entry => entry.label === "Radar Contact")!.children![1].instruction!;
        const response = engine.applyEnvelope(next, {id: randomUUID(), time: 1001, action: {kind: "command", aircraftId: a.id, frequency: station, replyTo: checkIn.id, command, text: catalog.instructionText(a, command)}});
        assert.equal(response.error, undefined);
        next = response.state;
        assert.equal(next.messages.at(-1)!.text, `${a.callsign}, radar contact, say approach request`);
        assert.equal(pendingPilotMessage(next, a.id, station), undefined);
        assert.equal(pendingCommands(next, a.id).length, 0);
        assert.equal(next.aircraft[0].radar!.report, "approach-request");
        next = engine.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(next))));
        const paused = {...next, running: false};
        assert.equal(engine.autoReadbacks(paused, 1002, randomUUID), paused);
        next = engine.autoReadbacks(next, 1003, randomUUID);
        assert.equal(next.messages.filter(message => message.request?.id === "request-approach").length, automatic ? 1 : 0);
        if (!automatic) {
          next = engine.applyEnvelope(next, {id: randomUUID(), time: 1004, action: {kind: "pilot", aircraftId: a.id, text: "", request: {id: "request-approach", runway: a.runway!}}}).state;
          assert.equal(next.aircraft[0].radar!.report, undefined);
          next = {...next, autoReadback: true};
        }
        const approachRequest = next.messages.at(-1)!;
        assert.equal(approachRequest.request?.id, "request-approach");
        assert.equal(approachRequest.commandId, undefined, "the approach request is separate from a readback");
        assert.equal(approachRequest.read, false);
        assert.match(approachRequest.text, new RegExp(`requesting ${type === "gps" ? "GPS" : type === "visual" ? "visual" : "ILS"} approach`));
        assert.equal(next.aircraft[0].radar!.expected, a.radar!.expected);
        assert.equal(next.aircraft[0].radar!.cleared, undefined);
        assert.ok(!catalog.requestMessageMenu(station, next.aircraft[0], approachRequest).some(entry => entry.label === "Radar Contact"));
        next = engine.autoReadbacks(next, 1005, randomUUID);
        assert.equal(next.messages.filter(message => message.request?.id === "request-approach").length, 1);
      });
    }
  }

  test(`${station}: plain Radar Contact acknowledges without requesting an approach`, () => {
    const {engine, state, catalog} = fixture(station);
    let next = engine.autoReadbacks(state, 1000, randomUUID);
    const a = next.aircraft[0], checkIn = pendingPilotMessage(next, a.id, station)!;
    const command = catalog.requestMessageMenu(station, a, checkIn).find(entry => entry.label === "Radar Contact")!.children![0].instruction!;
    const result = engine.applyEnvelope(next, {id: randomUUID(), time: 1001, action: {kind: "command", aircraftId: a.id, frequency: station, command, text: catalog.instructionText(a, command), replyTo: checkIn.id}});
    assert.equal(result.error, undefined);
    next = engine.autoReadbacks(result.state, 1002, randomUUID);
    assert.equal(next.messages.length, 2);
    assert.equal(next.messages[1].text, `${a.callsign}, radar contact`);
    assert.equal(pendingPilotMessage(next, a.id, station), undefined);
    assert.equal(next.aircraft[0].radar!.report, undefined);
  });

  test(`${station}: expected approach supplies the request when no pilot intention is set`, () => {
    const {engine, state} = fixture(station);
    const a = state.aircraft[0];
    a.radar!.expected = "gps-24";
    a.radar!.report = "approach-request";
    const next: Exercise = engine.autoReadbacks(state, 1000, randomUUID);
    assert.match(next.messages.at(-1)!.text, /requesting GPS approach/);
  });
}
