import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createAirportEngine, engineFor, applyEnvelope, autoReadbacks, advance, restoreExercise} from "./engine";
import {getAirport, airportList, airportRunways, airportSelection} from "./airports";
import {airportVisible} from "./command-navigation";
import {sightingTargetKey} from "./airport-sighting";
import {backTaxiRoute, progressiveRoute} from "./command-ground";
import {exerciseSchema, envelopeSchema, menteeActionAllowed} from "./protocol";
import type {Aircraft, Airport, Exercise, Instruction, Action} from "./model";

type Engine = ReturnType<typeof engineFor>;

const assign = (e: Engine, s: Exercise, command: Instruction) => {
  const r = e.applyEnvelope(s, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: s.aircraft[0].id, command}});
  assert.equal(r.error, undefined, JSON.stringify(command)); return r.state;
};

const tick = (e: Engine, s: Exercise, seconds: number) => {for (let i = 0; i < seconds; i++) s = e.advance(s, 1); return s;};

const radar = () => {const e = engineFor({trainingStation: "EGPH:approach"}), s = e.initialExercise(); s.running = true; delete s.aircraft[0].radar!.report; return {e, s};};

const synthetic: Airport = {
  ...getAirport(), elevation: 0,
  runway: {lengthFeet: 18000, ends: [{id: "36", heading: 0, point: {x: 0, y: 0}}, {id: "18", heading: 180, point: {x: 0, y: 3}}]},
  runways: [
    {id: "18/36", lengthFeet: 18000, ends: [{id: "36", heading: 0, point: {x: 0, y: 0}}, {id: "18", heading: 180, point: {x: 0, y: 3}}]},
    {id: "18R/36L", lengthFeet: 18000, ends: [{id: "36L", heading: 0, point: {x: .5, y: 0}}, {id: "18R", heading: 180, point: {x: .5, y: 3}}]},
  ],
  features: [
    {id: "cross", name: "A", kind: "taxiway", points: [{x: -1, y: 1}, {x: -.3, y: 1}, {x: 0, y: 1}, {x: .5, y: 1}, {x: 1, y: 1}]},
    {id: "parallel", name: "B", kind: "taxiway", points: [{x: -.3, y: 0}, {x: -.3, y: 1}, {x: -.3, y: 2}]},
  ],
};

function ground(): {e: Engine; s: Exercise; a: Aircraft} {
  const e = createAirportEngine(synthetic), s = e.initialExercise(); s.running = true; s.autoReadback = false;
  const a = e.newAircraft("operational", false); s.aircraft = [a];
  Object.assign(a, {runway: "36", frequency: "tower", position: {x: 0, y: .1}, heading: 0, targetHeading: 0});
  return {e, s, a};
}

test("airport-in-sight uses inclusive 15 NM/90 degree boundaries and reports once", () => {
  const {e, s} = radar(), a = s.aircraft[0], airport = getAirport(s);
  Object.assign(a, {position: {x: 0, y: -Math.sqrt(15 ** 2 - ((a.altitude - airport.elevation) / 6076.12) ** 2)}, heading: 90});
  assert.equal(airportVisible(a, airport), true);
  a.position.y = -15.001; assert.equal(airportVisible(a, airport), false);
  a.position.y = -14; a.heading = 90.01; assert.equal(airportVisible(a, airport), false);
  let next = assign(e, s, {type: "atc", action: "airport-in-sight"});
  next = e.autoReadbacks(next, 0, randomUUID); assert.equal(next.messages.length, 0);
  const looking = next.aircraft[0]; looking.heading = looking.targetHeading = 0;
  looking.airportSighting = {target: sightingTargetKey(looking, airport), seconds: 0, terrain: {position: {...looking.position}, altitude: looking.altitude, checkedAt: next.elapsed, status: "clear"}};
  next = e.autoReadbacks(e.advance(next, 3), 3000, randomUUID);
  assert.equal(next.messages[0].text, "Airport in sight, Speedbird 124");
  assert.equal(e.autoReadbacks(next, 2, randomUUID).messages.length, 1);
  assert.ok(exerciseSchema.safeParse(next).success);
});

test("own navigation, filed navigation and expect-approach filed restore the unflown route", () => {
  for (const command of [{type: "atc", action: "navigation", variant: "own"}, {type: "atc", action: "navigation", variant: "filed"}, {type: "expect-approach", approachId: "ils-24", navigation: "filed"}] as Instruction[]) {
    const {e, s} = radar(), a = s.aircraft[0]; a.radar!.routeIndex = 1;
    let next = assign(e, s, command); assert.equal(next.aircraft[0].radar!.navigation, "route");
    assert.equal(next.aircraft[0].radar!.routeIndex, 1);
    next = tick(e, next, 10); assert.notEqual(next.aircraft[0].heading, a.heading);
  }
});

test("STAR approvals descend along configured route constraints and survive reload", () => {
  for (const command of [{type: "atc", action: "star-descent", name: "TRAIN1"}, {type: "atc", action: "star-response", variant: "approve", name: "TRAIN1"}] as Instruction[]) {
    const {e, s} = radar(), a = s.aircraft[0]; a.arrivalProcedure = "TRAIN1"; a.altitude = 7000;
    a.flightPlan = [{x: a.position.x, y: a.position.y + 5, altitude: 4000, speed: 180}, {x: 0, y: 0, altitude: 3000, speed: 160}];
    let next = assign(e, s, command); next = tick(e, next, 20);
    assert.ok(next.aircraft[0].altitude < 7000); assert.equal(next.aircraft[0].targetSpeed, 180);
    next = e.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(next)))); next = tick(e, next, 120);
    assert.ok(next.aircraft[0].altitude <= 4000); assert.equal(next.aircraft[0].radar!.navigation, "route");
  }
});

test("approved diversion replaces destination and route; vector approval waits for vectors", () => {
  for (const variant of ["course", "vectors"]) {
    const {e, s} = radar(), a = s.aircraft[0]; a.diversionDestination = {name: "Alternate", point: {x: 30, y: -5}};
    const next = assign(e, s, {type: "atc", action: "diversion", variant, name: "Alternate"}), assigned = next.aircraft[0];
    assert.deepEqual(assigned.flightPlan, [{x: 30, y: -5}]); assert.equal(assigned.destination?.name, "Alternate");
    assert.equal(assigned.radar!.navigation, variant === "course" ? "route" : "heading");
    assert.ok(exerciseSchema.safeParse(next).success);
    if (variant === "vectors") assert.equal(assign(e, next, {type: "atc", action: "flight-following"}).aircraft[0].radar!.navigation, "route");
  }
});

test("a hold flies timed straight legs and two bank-limited turns, then exits onto route", () => {
  for (const hand of ["left", "right"] as const) {
    const {e, s} = radar(); s.aircraft[0].altitude = 4000; s.aircraft[0].speed = 180;
    let next = assign(e, s, {type: "atc", action: "hold", hand, altitude: {unit: "feet", value: 4000}});
    const phases = new Set<string>(); let straightSeconds = 0;
    for (let i = 0; i < 500; i++) {
      next = e.advance(next, 1); const a = next.aircraft[0], m = a.atcManeuver!;
      phases.add(m.phase!); assert.ok(Math.abs(a.bankAngle ?? 0) <= 25);
      if (m.phase === "outbound") straightSeconds++;
      if (i === 150) next = e.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(next))));
    }
    assert.ok(phases.has("turn-outbound") && phases.has("outbound") && phases.has("turn-inbound") && phases.has("inbound"), [...phases].join(","));
    assert.ok(straightSeconds >= 30);
    next = assign(e, next, {type: "atc", action: "exit-hold"}); assert.equal(next.aircraft[0].atcManeuver?.exitArmed, true);
    next = e.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(next))));
    for (let i = 0; i < 600 && next.aircraft[0].atcManeuver; i++) next = e.advance(next, 1);
    assert.equal(next.aircraft[0].atcManeuver, undefined); assert.equal(next.aircraft[0].radar!.navigation, "route");
  }
});

test("progressive turns use the next mapped junction and follow a selected moving aircraft", () => {
  const {e, s, a} = ground(); Object.assign(a, {position: {x: -.3, y: .2}, mode: "taxi", heading: 0, taxiPath: [], taxiIndex: 0});
  for (const variant of ["left", "right"]) {
    const plan = progressiveRoute(synthetic, a, variant); assert.equal(plan.error, undefined);
    assert.ok(plan.path!.some(p => Math.abs(p.y - 1) < 1e-6), "turn at the mapped intersection");
    const next = assign(e, s, {type: "atc", action: "progressive", variant});
    assert.ok(next.aircraft[0].taxiPath.some(p => variant === "left" ? p.x < -.3 : p.x > -.3));
  }
  const leader = {...structuredClone(a), id: "leader", position: {x: -.3, y: .3}, speed: 8, targetSpeed: 8, taxiPath: [{x: -.3, y: 1}], taxiIndex: 0};
  s.aircraft.push(leader);
  let next = assign(e, s, {type: "atc", action: "progressive", variant: "follow"});
  assert.equal(next.aircraft[0].followGroundId, leader.id);
  next = tick(e, next, 20); assert.ok(next.aircraft[0].position.y > .2); assert.ok(next.aircraft[1].position.y - next.aircraft[0].position.y >= .04);
});

test("back taxi aligns at the selected threshold or leaves by a mapped exit before Ground contact", () => {
  for (const contactGround of [false, true]) {
    const {e, s, a} = ground(); a.position.y = 2; a.heading = 180;
    assert.equal(backTaxiRoute(synthetic, a, "36", contactGround).error, undefined);
    let next = assign(e, s, {type: "atc", action: "back-taxi", runway: "36", contactGround, lineup: !contactGround, expedite: true});
    next = tick(e, next, 600); const end = next.aircraft[0];
    if (contactGround) {assert.equal(end.frequency, "ground"); assert.ok(Math.abs(end.position.x) >= .06);}
    else {assert.equal(end.mode, "lineup"); assert.equal(end.holding, true); assert.ok(Math.abs(end.heading) < 1);}
  }
});

test("rolling/immediate departures never stop on the runway; immediate enters faster", () => {
  const durations: number[] = [];
  {const {e, s, a} = ground(); Object.assign(a, {mode: "takeoff", speed: 80, targetSpeed: 160}); const next = assign(e, s, {type: "takeoff", runway: "36", immediate: true}); assert.equal(next.aircraft[0].mode, "takeoff"); assert.equal(next.aircraft[0].speed, 80);}
  for (const immediate of [false, true]) {
    const {e, s, a} = ground(); Object.assign(a, {position: {x: -.04, y: 1}, heading: 90, taxiPath: [{x: -.04, y: 1, hold: true}], taxiIndex: 0, holding: true});
    let next = assign(e, s, {type: "takeoff", runway: "36", immediate}), rolling = false, seconds = 0;
    for (; seconds < 600; seconds++) {
      next = e.advance(next, .1); const a = next.aircraft[0];
      if (Math.abs(a.position.x) < .02 && a.speed > 1) rolling = true;
      if (rolling) assert.ok(a.speed > 0, "rolling takeoff must not stop at the lineup endpoint");
      if (a.mode === "takeoff") break;
    }
    assert.ok(seconds < 600); durations.push(seconds);
  }
  assert.ok(durations[1] < durations[0], durations.join(","));
});

test("runway exit instructions reach the named hold or cross to the far side", () => {
  for (const cross of [false, true]) {
    const {e, s, a} = ground(); Object.assign(a, {mode: "rollout", position: {x: 0, y: .4}, speed: 35, targetSpeed: 0, landing: "full-stop"});
    let next = assign(e, s, {type: "exit-runway", side: "right", ...(cross ? {crossRunway: "36L"} : {holdShort: "36L"})});
    next = tick(e, next, 600); const end = next.aircraft[0];
    if (cross) assert.ok(end.position.x >= .56 - 1e-5, JSON.stringify(end.position));
    else {assert.ok(end.position.x <= .46 + 1e-5); assert.equal(end.holding, true); assert.equal(end.frequency, "tower"); assert.match(e.validateAssignment(end, {type: "cross", runway: "36"})!, /match the runway/);}
  }
});

test("Tower approach restriction releases on final, and Follow changes speed toward leading traffic", () => {
  const e = engineFor(), s = e.initialExercise(); s.running = true; s.autoReadback = false; s.aircraft = [e.newAircraft("speed", true)];
  const a = s.aircraft[0], g = e.runwayGeometry(a.runway!); a.mode = "heading"; a.leg = "final"; a.heading = a.targetHeading = g.heading;
  a.position = {x: g.threshold.x - g.vector.x * 4.1, y: g.threshold.y - g.vector.y * 4.1};
  let next = assign(e, s, {type: "radar-speed", mode: "approach", value: 160, until: 4});
  assert.equal(next.aircraft[0].speedInstruction?.until, 4);
  next = tick(e, next, 5); assert.equal(next.aircraft[0].speedInstruction, undefined); assert.equal(next.aircraft[0].speedMode, "auto");
  const leader = {...structuredClone(a), id: "leader", position: {x: a.position.x + g.vector.x * 2, y: a.position.y + g.vector.y * 2}, speed: 140, targetSpeed: 140, speedMode: "manual" as const};
  s.aircraft.push(leader); next = assign(e, s, {type: "radar-speed", mode: "follow"}); next = tick(e, next, 2);
  assert.ok(next.aircraft[0].targetSpeed < 160); assert.ok(exerciseSchema.safeParse(next).success);
});

test("a reversed hold entry and 360 retain valid snapshots while rolling through wings level", () => {
  for (const action of ["hold", "circle"] as const) {
    const {e, s} = radar(); s.aircraft[0].bankAngle = -25;
    let next = assign(e, s, {type: "atc", action, hand: "right", ...(action === "hold" ? {altitude: {unit: "feet" as const, value: 4000}} : {})});
    for (let i = 0; i < 20; i++) {next = e.advance(next, 1); assert.ok(exerciseSchema.safeParse(next).success);}
  }
});

test("following traffic preserves runway holds and requires a separate crossing clearance", () => {
  const {e, s, a} = ground(); Object.assign(a, {mode: "taxi", position: {x: -.15, y: 1}, heading: 90});
  const leader = {...structuredClone(a), id: "leader", position: {x: .15, y: 1}, speed: 15, targetSpeed: 15, taxiPath: [{x: 1, y: 1}], taxiIndex: 0};
  s.aircraft.push(leader);
  let next = assign(e, s, {type: "atc", action: "progressive", variant: "follow"});
  next = tick(e, next, 50);
  assert.equal(next.aircraft[0].holding, true);
  assert.ok(Math.abs(next.aircraft[0].position.x + .04) < 1e-5);
  assert.equal(next.aircraft[0].taxiPath[next.aircraft[0].taxiIndex].runway, "36");
});

test("back-taxi Ground handoff follows mapped exits at airports with mapped ground spawns", () => {
  for (const airport of airportList.filter(airport => airport.features.some(feature => feature.kind === "parking_position"))) {
    const e = engineFor(airportSelection(airport));
    for (const pair of airportRunways(airport)) for (const end of pair.ends) {
      const g = e.runwayGeometry(end.id), a = e.newAircraft("mapped", false);
      Object.assign(a, {runway: end.id, frequency: "tower", position: {x: g.threshold.x + (g.departure.x - g.threshold.x) * .99, y: g.threshold.y + (g.departure.y - g.threshold.y) * .99}, heading: (g.heading + 180) % 360});
      let s = {...e.initialExercise(), aircraft: [a], running: true, autoReadback: false};
      // These mapped-stand airports do not have connected runway exit geometry.
      if (airport.icao === "LIME" && ["12", "30"].includes(end.id) || airport.icao === "VNLK") {
        assert.match(backTaxiRoute(airport, a, end.id, true).error!, /No mapped runway exit/);
        continue;
      }
      s = assign(e, s, {type: "atc", action: "back-taxi", runway: end.id, contactGround: true});
      for (let i = 0; i < 300 && s.aircraft[0].backTaxi; i++) s = e.advance(s, 1);
      const endAircraft = s.aircraft[0];
      assert.equal(endAircraft.frequency, "ground", `${airport.icao} ${end.id}`);
      const lateral = Math.abs((endAircraft.position.x - g.threshold.x) * -g.vector.y + (endAircraft.position.y - g.threshold.y) * g.vector.x);
      assert.ok(lateral >= .06 - 1e-6);
      assert.ok(exerciseSchema.safeParse(s).success);
    }
  }
});

test("guard reaches an untuned aircraft without granting other controller commands", () => {
  const engine = engineFor({trainingStation: "EGPH:approach"}), state = engine.initialExercise();
  const aircraft = engine.newAircraft("guard-test", true); aircraft.frequency = "center"; state.aircraft = [aircraft];
  const command: Instruction = {type: "atc", action: "guard", frequency: "approach", variant: "contact"};
  assert.equal(engine.validateControllerMessage(state, aircraft, command, "approach"), null);
  if (command.type === "atc") {
    assert.equal(menteeActionAllowed({kind: "command", aircraftId: aircraft.id, frequency: "approach", command, text: "Guard warning"}, state), true);
    assert.equal(menteeActionAllowed({kind: "command", aircraftId: aircraft.id, frequency: "approach", command: {type: "vector", heading: 90}, text: "Vector"}, state), false);
    assert.equal(menteeActionAllowed({kind: "command", aircraftId: aircraft.id, frequency: "atis", command, text: "Guard warning"}, state), false);
  }
  assert.ok(engine.validateControllerMessage(state, aircraft, {type: "vector", heading: 90}, "approach"));
  assert.ok(engine.validateControllerMessage(state, aircraft, {...command, frequency: "center"}, "approach"));
  assert.ok(engine.validateControllerMessage(state, aircraft, command, "atis"));
  const result = engine.applyEnvelope(state, {id: "guard-warning", time: 1000, action: {kind: "command", aircraftId: aircraft.id, frequency: "approach", command}});
  assert.equal(result.error, undefined); assert.equal(result.state.messages.at(-1)?.frequency, "approach");
  assert.equal(result.state.aircraft[0].frequency, "center");
  assert.deepEqual(result.state.aircraft[0].position, aircraft.position);
  aircraft.active = false; assert.ok(engine.validateControllerMessage(state, aircraft, command, "approach"));
});

const act = (state: Exercise, action: Action) => {
  const result = applyEnvelope(state, {id: randomUUID(), time: 1000, action});
  assert.equal(result.error, undefined); return result.state;
};

const kdal = getAirport({airport: "KDAL"}), engine = engineFor({airport: "KDAL"});

const point = (runway: string, along: number, lateral = 0) => {
  const g = engine.runwayGeometry(runway);
  return {x: g.threshold.x + along * g.vector.x - lateral * g.vector.y, y: g.threshold.y + along * g.vector.y + lateral * g.vector.x};
};

const stateOf = (aircraft: Aircraft[]): Exercise => ({...engine.initialExercise(), aircraft, running: true});

const assignForTrainerImprovements = (state: Exercise, instruction: Instruction) => act(state, {kind: "maneuver", aircraftId: state.aircraft[0].id, command: instruction});

const radioTick = (state: Exercise) => autoReadbacks(advance(state, 2), 2000, randomUUID);

test("All full stop is one idempotent staff-only action and survives overhead transition automation", () => {
  let state = stateOf([engine.newAircraft("air", true), engine.newAircraft("ground", false)]);
  state.aircraft[0].intentions = {flight: "pattern", taxi: "runway", afterTransition: "touch-and-go"};
  state = assignForTrainerImprovements(state, {type: "transition", altitude: 1500});
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

test("Cancelling All full stop restores each aircraft's earlier landing intention, including traffic spawned meanwhile", () => {
  let state = stateOf([engine.newAircraft("first", true), engine.newAircraft("second", true)]);
  state.aircraft[0].landing = "touch-and-go"; state.aircraft[1].landing = "full-stop";
  state = applyEnvelope(state, {id: "fs-on", time: 0, action: {kind: "all-full-stop", enabled: true}}).state;
  assert.ok(state.aircraft.every(a => a.landing === "full-stop"));
  const spawned = engine.newAircraft("third", true); spawned.callsign = "Shamrock 77"; spawned.landing = "touch-and-go";
  const spawn = applyEnvelope(state, {id: "spawn", time: 0, action: {kind: "spawn", aircraft: spawned}});
  assert.equal(spawn.error, undefined); state = spawn.state;
  assert.equal(state.aircraft.at(-1)!.landing, "full-stop");
  assert.ok(exerciseSchema.parse(state).fullStopAll);
  state = applyEnvelope(state, {id: "fs-off", time: 0, action: {kind: "all-full-stop", enabled: false}}).state;
  assert.deepEqual(state.aircraft.map(a => a.landing), ["touch-and-go", "full-stop", "touch-and-go"]);
  assert.equal(state.fullStopAll, undefined);
});

test("intersection lineups/takeoffs stay at their entry, including lineup then takeoff and reload", () => {
  for (const runway of ["13L", "13R", "31L", "31R"]) for (const lateral of [0, .04, -.04]) for (const tagged of [false, true]) {
    const entry = .1, hold = {...point(runway, entry, lateral), hold: true, ...(tagged ? {runway} : {})};
    const a = {...engine.newAircraft("a", false), runway, position: {...hold}, mode: "taxi" as const, holding: true, taxiPath: [hold], taxiIndex: 0};
    let state = assignForTrainerImprovements(stateOf([a]), {type: "lineup", runway});
    assert.ok(state.aircraft[0].taxiPath.every(p => Math.hypot(p.x - engine.runwayGeometry(runway).threshold.x, p.y - engine.runwayGeometry(runway).threshold.y) >= .09));
    for (let i = 0; i < 90 && !state.aircraft[0].holding; i++) state = advance(state, 1);
    assert.equal(state.aircraft[0].holding, true, `${runway}/${lateral}`);
    state = assignForTrainerImprovements(restoreExercise(exerciseSchema.parse(state)), {type: "takeoff", runway});
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
