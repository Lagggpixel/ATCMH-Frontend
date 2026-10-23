import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {airportList, getAirport} from "./airports";
import {applyEnvelope, autoReadbacks, advance, engineFor, readbackText, restoreExercise} from "./engine";
import {catalogFor, positionReportText} from "./catalog";
import {gateTargets} from "./gate-placement";
import {gatesFor, standPlacement} from "./scenarios";
import {planParkingRoute, planTaxiRoute} from "./taxi-routing";
import {planPushback} from "./ground-movement";
import {aviationSpeech} from "./radio-audio";
import {envelopeSchema, exerciseSchema, menteeActionAllowed, motionSchema} from "./protocol";
import {applyReplayDelta, replayDelta} from "./replays";
import {DEFAULTS, type Action, type Aircraft, type Exercise, type Instruction} from "./model";
import {MemoryStore} from "./session-test-store";
import {SessionService} from "./server/session-service";

const act = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
};
const kdal = getAirport({airport: "KDAL"}), engine = engineFor({airport: "KDAL"}), catalog = catalogFor(kdal);
const point = (runway: string, along: number, lateral = 0) => {
  const g = engine.runwayGeometry(runway);
  return {x: g.threshold.x + along * g.vector.x - lateral * g.vector.y, y: g.threshold.y + along * g.vector.y + lateral * g.vector.x};
};
const stateOf = (aircraft: Aircraft[]): Exercise => ({...engine.initialExercise(), aircraft, running: true});
const assign = (state: Exercise, instruction: Instruction) => act(state, {kind: "maneuver", aircraftId: state.aircraft[0].id, command: instruction});
const radioTick = (state: Exercise) => autoReadbacks(advance(state, 2), 2000, randomUUID);

test("KDAL 13 and 15A put the nose beside the terminal, preserving the pinned map and connected routes", () => {
  const source = JSON.stringify(kdal);
  for (const name of ["13", "15A"]) {
    const gate = gatesFor(kdal).find(g => g.name === name)!;
    const placement = standPlacement(gate.id, false, kdal)!;
    assert.deepEqual(placement.position, gate.points[0]);
    assert.ok(placement.position.y > .05, "nose is at the terminal end, not the apron taxiway");
    assert.ok(placement.heading < 45 || placement.heading > 315);
    assert.deepEqual(gateTargets(kdal).find(g => g.id === gate.id)!.point, placement.position);
    const a = {...engine.newAircraft(name, false), ...placement};
    assert.ok(planPushback(kdal, a, "east").path, name);
    assert.ok(planTaxiRoute(kdal, placement.position, "31L").path, name);
    const parking = planParkingRoute(kdal, {x: -.24, y: .02}, gate.id);
    assert.ok(parking.path, parking.error);
    assert.deepEqual(parking.path!.at(-1), placement.position);
  }
  assert.equal(JSON.stringify(kdal), source);
});

test("inbound and runway-change requests use current location, altitude and published ATIS", () => {
  const a = {...engine.newAircraft("a", true), callsign: "N714KG", position: {x: Math.SQRT1_2 * 5, y: -Math.SQRT1_2 * 5}, altitude: 1500};
  const state = stateOf([a]); state.publishedDraft = {...state.atis, letter: "X"};
  const request = catalog.resolvePilotRequest({requestId: "inbound-option"})!;
  assert.equal(catalog.pilotRequestText(a, request, "31R", false, {exercise: state}), "Dallas Tower, N714KG is 5 miles to the southeast at 1500 feet, inbound for Touch and Go with information X, requesting Runway 31R");
  const sent = act(state, {kind: "pilot", aircraftId: a.id, text: "stale preview", request: {id: "inbound-option", runway: "31R"}});
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

test("position reports use the real leg/hand/runway/outcome and never assign a maneuver", () => {
  for (const leg of ["final", "downwind", "base", "crosswind", "upwind"] as const) for (const hand of ["left", "right"] as const) for (const landing of ["full-stop", "touch-and-go"] as const) {
    const a = {...engine.newAircraft("a", true), callsign: "N714KG", runway: "31R", leg, hand, landing};
    const state = stateOf([a]), next = act(state, {kind: "report-position", aircraftId: a.id});
    assert.equal(next.messages.at(-1)!.text, `N714KG is on ${["final", "upwind"].includes(leg) ? leg : `${hand} ${leg}`} 31R, ${landing === "full-stop" ? "full stop" : "touch and go"}`);
    assert.deepEqual(next.aircraft, state.aircraft.map(a => ({...a, pending: a.pending + 1})));
    assert.equal(next.messages.at(-1)!.request, undefined);
  }
  assert.match(positionReportText({...engine.newAircraft("a", true), mode: "heading"}, kdal), /nautical miles/);
  const ground = engine.newAircraft("ground", false);
  assert.match(applyEnvelope(stateOf([ground]), {id: "invalid", time: 0, action: {kind: "report-position", aircraftId: ground.id}}).error!, /airborne traffic on Tower/);
});

test("All full stop is one idempotent staff-only action and survives overhead transition automation", () => {
  let state = stateOf([engine.newAircraft("air", true), engine.newAircraft("ground", false)]);
  state.aircraft[0].intentions = {flight: "pattern", taxi: "runway", afterTransition: "touch-and-go"};
  state = assign(state, {type: "transition", altitude: 1500});
  state.aircraft[0].position = {x: 0, y: 0};
  const envelope = {id: "full-stop", time: 1000, action: {kind: "all-full-stop"} as const};
  state = applyEnvelope(state, envelope).state;
  assert.ok(state.aircraft.every(a => a.landing === "full-stop"));
  assert.equal(applyEnvelope(state, envelope).state, state);
  state = radioTick(state);
  assert.equal(state.aircraft[0].landing, "full-stop");
  assert.equal(state.messages.at(-1)!.request?.id, "inbound-land");
  assert.ok(restoreExercise(exerciseSchema.parse(state)).aircraft.every(a => a.landing === "full-stop"));
  for (const action of [{kind: "all-full-stop"}, {kind: "report-position", aircraftId: "air"}] as Action[]) {
    const parsed = envelopeSchema.parse({id: "staff", time: 0, action});
    assert.equal(menteeActionAllowed(parsed.action, state), false);
  }
  assert.equal(envelopeSchema.safeParse({id: "edit", time: 0, action: {kind: "edit", aircraftId: "air", patch: {towerCheckInPending: true}}}).success, false);
});

test("Tower contact before arrival at the hold reports ready exactly once; Automatic off stays manual", () => {
  const runway = "31L", hold = {...point(runway, .15, .04), hold: true};
  const a = {...engine.newAircraft("a", false), mode: "taxi" as const, runway, position: {...hold, x: hold.x + .04}, taxiPath: [hold], taxiIndex: 0, heading: 270, targetHeading: 270, speed: 15, targetSpeed: 15};
  let state = assign(stateOf([a]), {type: "frequency", frequency: "tower"});
  assert.equal(state.aircraft[0].towerCheckInPending, true);
  assert.equal(radioTick(state).messages.length, 0, "cannot report ready while still taxiing");
  state = restoreExercise(exerciseSchema.parse(state));
  for (let t = 0; t < 90 && !state.messages.length; t++) state = radioTick(state);
  assert.equal(state.messages.length, 1);
  assert.match(state.messages[0].text, /ready for departure from runway 31L/);
  state = radioTick(state); assert.equal(state.messages.length, 1);
  const off = radioTick({...stateOf([a]), autoReadback: false}); assert.equal(off.messages.length, 0);
});

test("intersection lineups/takeoffs stay at their entry, including lineup then takeoff and reload", () => {
  for (const runway of ["13L", "13R", "31L", "31R"]) for (const lateral of [0, .04, -.04]) for (const tagged of [false, true]) {
    const entry = .1, hold = {...point(runway, entry, lateral), hold: true, ...(tagged ? {runway} : {})};
    const a = {...engine.newAircraft("a", false), runway, position: {...hold}, mode: "taxi" as const, holding: true, taxiPath: [hold], taxiIndex: 0};
    let state = assign(stateOf([a]), {type: "lineup", runway});
    assert.ok(state.aircraft[0].taxiPath.every(p => Math.hypot(p.x - engine.runwayGeometry(runway).threshold.x, p.y - engine.runwayGeometry(runway).threshold.y) >= .09));
    for (let i = 0; i < 90 && !state.aircraft[0].holding; i++) state = advance(state, 1);
    assert.equal(state.aircraft[0].holding, true, `${runway}/${lateral}`);
    state = assign(restoreExercise(exerciseSchema.parse(state)), {type: "takeoff", runway});
    let previousAlong = entry - .002, airborne = false;
    const g = engine.runwayGeometry(runway);
    for (let i = 0; i < 90 && !airborne; i++) {
      state = advance(state, 1); const current = state.aircraft[0];
      const along = (current.position.x - g.threshold.x) * g.vector.x + (current.position.y - g.threshold.y) * g.vector.y;
      assert.ok(along >= previousAlong - 1e-6, "never back-taxis toward the threshold"); previousAlong = along;
      airborne = current.altitude > kdal.elevation + 1;
    }
    assert.ok(airborne, `${runway}/${lateral}`);
  }
});

test("colliding approved pushbacks disappear together on any frequency, with durable replay events", () => {
  const create = (id: string, x: number, heading: number): Aircraft => ({...engine.newAircraft(id, false), mode: "pushback", position: {x, y: 0}, heading, targetHeading: heading, speed: 3, targetSpeed: 3, pushback: {path: [{x: -x, y: 0}, {x: -x * 2, y: 0}], index: 0}});
  const before = stateOf([create("a", -.04, 270), {...create("b", .04, 90), frequency: "tower"}]);
  let state = before;
  for (let t = 0; t < 60 && state.aircraft.some(a=>a.active); t++) state = advance(state, 1);
  assert.equal(state.aircraft.filter(a=>a.active).length, 0); assert.equal(state.collisions?.length, 1);
  assert.deepEqual(state.collisions[0].aircraft.map(a => a.id), ["a", "b"]);
  assert.equal(motionSchema.parse(state).collisions?.length, 1);
  assert.deepEqual(applyReplayDelta(before, replayDelta(before, state)), state);
  const reloaded = restoreExercise(exerciseSchema.parse(state));
  assert.deepEqual(reloaded.collisions, state.collisions);
  assert.equal(advance(reloaded, 5).collisions?.length, 1);
  let reverse = {...before, aircraft: before.aircraft.toReversed()};
  for (let t = 0; t < 60 && reverse.aircraft.length; t++) reverse = advance(reverse, 1);
  assert.deepEqual(reverse.collisions, state.collisions);
  assert.equal(before.aircraft.length, 2, "motion never mutates its input");
});

test("a completed hand-drawn intersection route needs no hold flag for Tower check-in or takeoff", () => {
  const runway = "31L", position = point(runway, .15, .04);
  const a = {...engine.newAircraft("a", false), runway, mode: "parked" as const, position, taxiPath: [position], taxiIndex: 1, holding: false};
  const contact = assign(stateOf([a]), {type: "frequency", frequency: "tower"});
  const ready = radioTick(contact); assert.equal(ready.messages.length, 1); assert.match(ready.messages[0].text, /ready for departure from runway 31L/);
  const departure = assign(ready, {type: "takeoff", runway});
  const g = engine.runwayGeometry(runway), entry = departure.aircraft[0].taxiPath.at(-2)!;
  assert.ok(Math.abs((entry.x - g.threshold.x) * g.vector.x + (entry.y - g.threshold.y) * g.vector.y - .15) < 1e-7);
  const parking = {...a, intentions: {flight: "pattern" as const, taxi: "parking" as const, afterTransition: "continue" as const}};
  assert.equal(radioTick(assign(stateOf([parking]), {type: "frequency", frequency: "tower"})).messages.length, 0);
});

test("a held pushback can resume its remaining route after the obstruction is removed", () => {
  const gate = gatesFor(kdal).find(g => g.name === "13")!;
  const a = {...engine.newAircraft("a", false), ...standPlacement(gate.id, false, kdal)!};
  let state = assign(stateOf([a]), {type: "pushback", tail: "east"});
  state = advance(state, 5); const path = state.aircraft[0].pushback!.path;
  state = assign(state, {type: "stop"}); state = advance(state, 1);
  const position = state.aircraft[0].position;
  state = assign(state, {type: "pushback", tail: "east"});
  assert.deepEqual(state.aircraft[0].pushback!.path, path);
  state = advance(state, 5);
  assert.notDeepEqual(state.aircraft[0].position, position);
});

test("default spacing is 3 NM for every airport engine", () => {
  assert.equal(DEFAULTS.sequenceDistance, 3);
  for (const airport of airportList) assert.ok(engineFor({airport: airport.icao}).initialExercise());
});

test("conflicting real KDAL gate pushbacks collide only when their mapped paths meet", () => {
  for (const tail of ["east", "west"] as const) {
    let state = stateOf(["13", "15"].map(name => {
      const gate = gatesFor(kdal).find(g => g.name === name)!;
      return {...engine.newAircraft(name, false), ...standPlacement(gate.id, false, kdal)!};
    }));
    for (const aircraft of state.aircraft) state = act(state, {kind: "maneuver", aircraftId: aircraft.id, command: {type: "pushback", tail}});
    for (let t = 0; t < 180 && state.aircraft.length === 2; t++) state = advance(state, 1);
    assert.equal(state.aircraft.length, tail === "west" ? 0 : 2);
    assert.equal(state.collisions?.length ?? 0, tail === "west" ? 1 : 0);
  }
});

test("session service rejects learner bulk/report actions and marks collision frames as content", async () => {
  const store = new MemoryStore(); let now = 1000;
  const service = new SessionService(store, () => now), staff = {accountId: "mentor", staff: true}, learner = {accountId: "learner", staff: false, learnerSession:""};
  const created = await service.create(staff, "Synthetic controls", stateOf([engine.newAircraft("a", true)]));
  learner.learnerSession=created.id;
  await service.join(staff, created.id, "staff", "staff-seat"); await service.join(learner, created.id, "mentee", "learner-seat");
  for (const action of [{kind: "all-full-stop"}, {kind: "report-position", aircraftId: "a"}] as Action[]) {
    await assert.rejects(service.dispatch(learner, created.id, "mentee", "learner-seat", {id: randomUUID(), time: now, action}), /unavailable/);
    await service.dispatch(staff, created.id, "staff", "staff-seat", {id: randomUUID(), time: now, action});
  }
  const record = store.records.get(created.id)!;
  assert.equal(record.exercise.aircraft[0].landing, "full-stop"); assert.equal(record.exercise.messages.length, 1);
  record.exercise.aircraft = ["a", "b"].map((id, i) => ({...engine.newAircraft(id, false), mode: "pushback", position: {x: i * .03, y: 0}, heading: i ? 90 : 270, targetHeading: i ? 90 : 270, speed: 3, targetSpeed: 3, pushback: {path: [{x: i ? -.1 : .1, y: 0}, {x: i ? -.2 : .2, y: 0}], index: 0}}));
  const before = record.contentRevision;
  for (let t = 0; t < 30 && store.records.get(created.id)!.exercise.aircraft.some(a=>a.active); t++) {now += 1000; await service.join(staff, created.id, "staff", "staff-seat");await service.frame(staff, created.id, "staff", "staff-seat");}
  await service.join(learner, created.id, "mentee", "learner-seat");
  const frame = await service.frame(learner, created.id, "mentee", "learner-seat");
  assert.equal(frame.exercise.aircraft.length, 0); assert.equal(frame.exercise.collisions?.length, 1);
  assert.ok(frame.contentRevision > before, "stream and replay must receive the collision as a content update");
});
