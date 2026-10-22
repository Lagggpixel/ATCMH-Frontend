import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import geomagnetism from "geomagnetism";
import variation from "./data/magnetic-variation.json";
import {airportList, getAirport, runwayEnds} from "./airports";
import {engineFor, restoreExercise} from "./engine";
import {catalogFor} from "./catalog";
import {magneticHeadingLabel, magneticToTrue, magneticVariation, trueToMagnetic} from "./magnetic-headings";
import {approachGeometry, assignRadar, headingDifference, moveRadar, radarInstructionText, snappedVectorHeading, turnTransmission, vectorPreview} from "./radar";
import {exerciseSchema} from "./protocol";
import {automaticRadarUnable} from "./radar-safety";
import type {Action, Exercise, Instruction} from "./model";

const near = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const act = (state: Exercise, action: Action) => {
  const result = engineFor(state).applyEnvelope(state, {id: randomUUID(), time: 0, action});
  assert.equal(result.error, undefined); return result.state;
};
function fixture(icao = "CYUL", station: "approach" | "center" = "approach") {
  const engine = engineFor({airport: icao, trainingStation: `${icao}:${station}`}), state = engine.initialExercise();
  state.aircraft = [state.aircraft[0]]; state.running = state.autoReadback = true;
  delete state.aircraft[0].radar!.report;
  return {engine, state, airport: getAirport(state), env: state.radarEnvironment!, a: state.aircraft[0]};
}

test("every supported airport has reproducible WMM-2025 variation, with east/west signs and north wrapping", () => {
  assert.deepEqual(Object.keys(variation.airports).sort(), airportList.map(a => a.icao).sort());
  const model = geomagnetism.model(new Date(`${variation.date}T00:00:00Z`));
  for (const airport of airportList) {
    near(magneticVariation(airport), model.point([airport.origin.lat, airport.origin.lon, airport.elevation * .0003048]).decl, .000051);
    for (const magnetic of [0, 1, 90, 180, 270, 359, 360, 720, -1]) {
      const trueHeading = magneticToTrue(magnetic, airport);
      assert.ok(trueHeading >= 0 && trueHeading < 360);
      near(headingDifference(trueToMagnetic(trueHeading, airport), (magnetic % 360 + 360) % 360), 0);
    }
  }
  near(magneticToTrue(340, {icao: "CYUL"}), 326.5005);
  assert.ok(magneticVariation({icao: "KDAL"}) > 2);
  assert.ok(magneticVariation({icao: "SBBR"}) < -20);
  assert.equal(magneticHeadingLabel(magneticToTrue(360, {icao: "CYUL"}), {icao: "CYUL"}), 360);
  assert.throws(() => magneticVariation({icao: "XXXX"}), /No pinned magnetic variation/);
});

for (const station of ["approach", "center"] as const) for (const airport of airportList) {
  test(`${airport.icao} ${station}: headings, drag vectors and localizer angles share a north reference`, () => {
    const f = fixture(airport.icao, station);
    for (const end of runwayEnds(airport)) {
      const g = approachGeometry(airport, end.id);
      // Exercise both sides of every runway, with the same magnetic number sent and displayed.
      for (const side of [-1, 1]) {
        const magnetic = Math.round(trueToMagnetic(g.heading + side * 25, airport) / 10) * 10 % 360;
        f.a.position = {x: g.threshold.x - g.vector.x * 8 - g.vector.y * side * .1, y: g.threshold.y - g.vector.y * 8 + g.vector.x * side * .1};
        assignRadar(f.a, {type: "vector", heading: magnetic}, airport, f.env);
        near(f.a.targetHeading, magneticToTrue(magnetic, airport));
        f.a.heading = f.a.targetHeading;
        const endpoint = {x: f.a.position.x + Math.sin(f.a.heading * Math.PI / 180) * 5, y: f.a.position.y + Math.cos(f.a.heading * Math.PI / 180) * 5};
        assert.equal(vectorPreview(f.a, endpoint, airport, f.env).heading, magnetic);
        assert.equal(snappedVectorHeading(f.a.position, endpoint, airport), magnetic);
        const ils = f.env.approaches.find(p => p.runway === end.id && p.type === "ils");
        if (!ils) continue;
        f.a.altitude = airport.elevation + 2000;
        assignRadar(f.a, {type: "expect-approach", approachId: ils.id}, airport, f.env);
        assignRadar(f.a, {type: "vector", approachId: ils.id}, airport, f.env);
        moveRadar(f.a, .05, airport, f.env, [], true);
        assert.equal(f.a.radar!.localizer, true, `${end.id}, heading ${magnetic} magnetic`);
        assert.equal(f.a.radar!.navigation, "approach");
        assert.equal(f.a.radar!.missedReason, undefined);
      }
    }
  });
  test(`${airport.icao} ${station}: automatic MA retains its configured true course`, () => {
    const f = fixture(airport.icao, station), p = f.env.approaches[0], g = approachGeometry(airport, p.runway);
    f.a.position = {x: g.threshold.x - g.vector.x * 8, y: g.threshold.y - g.vector.y * 8};
    f.a.heading = f.a.targetHeading = g.heading; f.a.altitude = airport.elevation + 10000;
    assignRadar(f.a, {type: "expect-approach", approachId: p.id}, airport, f.env);
    assignRadar(f.a, {type: "vector", approachId: p.id}, airport, f.env);
    moveRadar(f.a, .05, airport, f.env, [], true);
    assert.equal(f.a.radar!.navigation, "missed");
    near(f.a.targetHeading, p.missedHeading);
  });
}


test("radio turn directions compare true geometry but speak the assigned magnetic heading", () => {
  const f = fixture(); f.a.heading = magneticToTrue(350, f.airport);
  assert.equal(turnTransmission(f.a, 10, f.airport), "turn right heading zero one zero");
  f.a.heading = magneticToTrue(10, f.airport);
  assert.equal(turnTransmission(f.a, 350, f.airport), "turn left heading three five zero");
  assert.match(radarInstructionText(f.a, {type: "vector", heading: 350}, f.env, f.airport)!, /three five zero/);
});

for (const station of ["approach", "center"] as const) test(`${station}: pilot MA accepts ordinary and MA replies, including after restore and another vector`, () => {
  const f = fixture("CYUL", station); f.a.heading = magneticToTrue(300, f.airport); f.a.targetHeading = magneticToTrue(340, f.airport); f.a.bankAngle = 15;
  let state = act(f.state, {kind: "pilot", aircraftId: f.a.id, text: "", request: {id: "missed-approach", runway: "24R"}});
  const report = state.messages.at(-1)!, a = state.aircraft[0];
  assert.equal(a.targetHeading, f.a.targetHeading); assert.equal(a.bankAngle, 15);
  const menu = catalogFor(f.airport, f.env).requestMessageMenu(station, a, report);
  assert.deepEqual(menu.filter(e => e.suggested).map(e => e.label), ["Vectoring Instructions", "Missed Approach Instructions"]);
  assert.equal(menu.filter(e => e.label === "Vectoring Instructions").length, 1);
  assert.equal(menu.filter(e => e.label === "Missed Approach Instructions").length, 1);
  assert.deepEqual(catalogFor(f.airport, f.env).requestMessageMenu(station, a, {...report, request: undefined}), menu, "legacy/automatic plain-text reports get the same replies");
  state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  for (const command of [{type: "vector", heading: 90}, {type: "missed-approach", heading: 180, altitude: {unit: "feet", value: 6000}}, {type: "missed-approach", altitude: {unit: "feet", value: 5000}}] satisfies Instruction[]) {
    const before = state.aircraft[0].targetHeading;
    state = act(state, {kind: "command", aircraftId: a.id, frequency: station, command, ...(state.messages.some(m => m.replyTo === report.id) ? {} : {replyTo: report.id}), text: ""});
    const sent = state.messages.at(-1)!;
    state = f.engine.autoReadbacks(f.engine.advance(state, 1.5), 1500, randomUUID);
    const reply = state.messages.find(m => m.commandId === sent.id)!;
    assert.ok(reply); assert.equal(reply.unableReason, undefined); assert.doesNotMatch(reply.text, /Unable/);
    near(state.aircraft[0].targetHeading, command.heading === undefined ? before : magneticToTrue(command.heading, f.airport));
    assert.equal(state.aircraft[0].radar!.missedApproach, true);
  }
  const legacy = fixture("CYUL", station);
  legacy.a.radar!.navigation = "missed"; delete legacy.a.radar!.missedApproach;
  assignRadar(legacy.a, {type: "vector", heading: 90}, legacy.airport, legacy.env);
  assert.equal(automaticRadarUnable(legacy.a, {type: "missed-approach", altitude: {unit: "feet", value: 5000}}), null, "legacy missed snapshots retain the phase after a normal vector");
  assert.equal(automaticRadarUnable(fixture().a, {type: "missed-approach", altitude: {unit: "feet", value: 5000}}), "Not cleared for approach.");
  assignRadar(state.aircraft[0], {type: "expect-approach", approachId: "ils-24R"}, f.airport, f.env);
  assignRadar(state.aircraft[0], {type: "vector", approachId: "ils-24R"}, f.airport, f.env);
  assert.equal(state.aircraft[0].radar!.missedApproach, undefined, "new approach clearance starts a fresh approach phase");
});

for (const station of ["approach", "center"] as const) for (const missed of [false, true]) test(`${station}: ${missed ? "MA" : "ordinary"} altitude alone preserves an actual banked turn`, () => {
  const f = fixture("KDAL", station); f.a.heading = magneticToTrue(300, f.airport); f.a.targetHeading = magneticToTrue(340, f.airport); f.a.bankAngle = 15;
  f.a.radar!.navigation = missed ? "missed" : "heading"; f.a.radar!.missedApproach = missed || undefined;
  f.a.radar!.routeSpeed = 210;
  const target = f.a.targetHeading, heading = f.a.heading;
  const command: Instruction = {type: missed ? "missed-approach" : "vector", altitude: {unit: "feet", value: 6000}};
  const state = act(f.state, {kind: "maneuver", aircraftId: f.a.id, command}), a = state.aircraft[0];
  assert.equal(a.targetHeading, target); assert.equal(a.bankAngle, 15); assert.deepEqual(a.radar!.targetAltitude, command.altitude);
  assert.doesNotMatch(radarInstructionText(a, command, f.env, f.airport)!, /heading/);
  const after = f.engine.advance(state, 5).aircraft[0];
  assert.equal(after.targetHeading, target);
  assert.ok(Math.abs(headingDifference(target, after.heading)) < Math.abs(headingDifference(target, heading)), "aircraft continues toward the previously assigned heading");
  if (!missed) assert.equal(a.radar!.routeSpeed, 210, "vertical-only vectors retain lateral route constraints");
});
