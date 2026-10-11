import assert from "node:assert/strict";
import test from "node:test";
import {advance, applyEnvelope, initialExercise, patternTargets, predictAircraft, restoreExercise, runwayGeometry, speedProfile} from "./engine";
import {DEFAULTS, type Aircraft, type Runway} from "./model";
import {envelopeSchema, exerciseSchema, menteeActionAllowed, speedTargetsSchema} from "./protocol";
import {blankScenario, createScenarioExercise, scenarioFromExercise, scenarioSchema, seedFromAircraft} from "./scenarios";
import {advanceScenario} from "./scenario-engine";

function onFinal(a: Aircraft, nm: number) {
  const g = runwayGeometry(a.runway ?? "24");
  a.mode = "pattern"; a.leg = "final"; a.heading = a.targetHeading = g.heading;
  a.position = {x: g.threshold.x - g.vector.x * nm, y: g.threshold.y - g.vector.y * nm};
}

test("automatic IAS profiles cover each leg and the exact final distance boundaries on both runways", () => {
  for (const runway of ["06", "24"] as Runway[]) {
    const a = initialExercise().aircraft[0]; a.runway = runway;
    for (const leg of ["upwind", "crosswind", "downwind", "base"] as const) {
      a.leg = leg;
      assert.equal(speedProfile(a).target, leg === "base" ? 180 : 220);
    }
    for (const [nm, target] of [[7, 180], [4.51, 180], [4.5, 160], [3, 160], [2.01, 160], [2, 135], [.5, 135]]) {
      onFinal(a, nm); assert.equal(speedProfile(a).target, target, `${runway}/${nm}`);
    }
  }
});

test("aircraft accelerate and decelerate gradually, while predictions use the same automatic profile", () => {
  const state = initialExercise(); state.running = true;
  const a = state.aircraft[0]; a.leg = "downwind"; a.extended = true; a.speed = 160;
  const next = advance(state, 5).aircraft[0];
  assert.equal(next.targetSpeed, 220); assert.ok(Math.abs(next.speed - 175) < 1e-8);
  assert.equal(a.speed, 160, "input snapshot is unchanged");
  onFinal(a, 1); a.speed = 180;
  const slowed = advance(state, 5).aircraft[0];
  assert.equal(slowed.targetSpeed, 135); assert.ok(Math.abs(slowed.speed - 165) < 1e-8);
  assert.deepEqual(predictAircraft(state.aircraft, 1).map(a => a.position), advance(state, 1).aircraft.map(a => a.position));
});

test("manual IAS survives leg changes and reload, and staff can explicitly resume automatic speeds", () => {
  let state = initialExercise(); state.running = true;
  const maneuver = (command: {type: "speed"; value: number} | {type: "pattern"; leg: "base"}) => {
    const result = applyEnvelope(state, {id: `speed-${state.revision}`, time: 1, action: {kind: "maneuver", aircraftId: "demo-air", command}});
    assert.equal(result.error, undefined); state = result.state;
  };
  maneuver({type: "speed", value: 195}); maneuver({type: "pattern", leg: "base"});
  state = restoreExercise(exerciseSchema.parse(state));
  assert.equal(advance(state, 1).aircraft[0].targetSpeed, 195);
  const action = {kind: "edit" as const, aircraftId: "demo-air", patch: {speedMode: "auto" as const}};
  assert.ok(envelopeSchema.safeParse({id: "resume-speed", time: 1, action}).success);
  assert.equal(menteeActionAllowed(action), false);
  state = applyEnvelope(state, {id: "resume-speed", time: 1, action}).state;
  assert.equal(advance(state, 1).aircraft[0].targetSpeed, 180);
});

test("legacy snapshots default to automatic IAS without changing ground movement", () => {
  const state = restoreExercise(exerciseSchema.parse(initialExercise())); state.running = true;
  assert.equal(state.aircraft[0].speedMode, undefined);
  onFinal(state.aircraft[0], 1);
  const next = advance(state, 5);
  assert.equal(next.aircraft[0].targetSpeed, 135);
  assert.equal(next.aircraft[1].targetSpeed, 0); assert.equal(next.aircraft[1].speed, 0);
});

test("default patterns establish final about 4.5 NM out on both runway ends and hands", () => {
  for (const runway of ["06", "24"] as const) for (const hand of ["left", "right"] as const) {
    let state = initialExercise(); state.running = true; state.aircraft = [state.aircraft[0]];
    const a = state.aircraft[0], g = runwayGeometry(runway);
    a.runway = runway; a.hand = hand; a.leg = "downwind"; a.speed = 220; a.heading = a.targetHeading = (g.heading + 180) % 360;
    a.position = {...patternTargets(a).crosswind};
    let established = false;
    for (let i = 0; i < 1600; i++) {
      state = advance(state, .25); const flown = state.aircraft[0];
      const angle = Math.abs(((flown.heading - g.heading + 540) % 360) - 180);
      if (flown.leg === "final" && angle < 5) {
        const nm = -((flown.position.x - g.threshold.x) * g.vector.x + (flown.position.y - g.threshold.y) * g.vector.y);
        assert.ok(Math.abs(nm - DEFAULTS.finalLength) < .3, `${runway}/${hand}: established at ${nm} NM`);
        established = true; break;
      }
    }
    assert.ok(established);
  }
});

test("Inbound applies only outside the pattern, including departures and heading overrides", () => {
  let state = initialExercise(); const a = state.aircraft[0]; onFinal(a, 1);
  a.mode = "heading";
  assert.equal(speedProfile(a).segment, "inbound"); assert.equal(speedProfile(a).target, 250);
  state = applyEnvelope(state, {id: "join-pattern", time: 1, action: {kind: "maneuver", aircraftId: a.id, command: {type: "pattern", leg: "downwind"}}}).state;
  assert.equal(state.aircraft[0].targetSpeed, 220);
  state = applyEnvelope(state, {id: "leave-pattern", time: 2, action: {kind: "maneuver", aircraftId: a.id, command: {type: "departure", direction: "north"}}}).state;
  assert.equal(state.aircraft[0].targetSpeed, 250); assert.equal(speedProfile(state.aircraft[0]).segment, "inbound");
  for (const mode of ["takeoff", "go-around"] as const) {
    a.mode = mode; a.leg = "final"; assert.equal(speedProfile(a).segment, "upwind-downwind"); assert.equal(speedProfile(a).target, 220);
  }
});

test("semi-auto applies fixed targets only to their phases and blank targets return to automatic defaults", () => {
  let state = initialExercise(); const a = state.aircraft[0]; a.mode = "heading";
  const targets = {inbound: 240, "upwind-downwind": 225, base: 190, final: 155, vref: 130};
  a.speedTargets = targets;
  assert.equal(speedProfile(a).target, 240);
  a.mode = "pattern";
  for (const leg of ["upwind", "crosswind", "downwind"] as const) {a.leg = leg; assert.equal(speedProfile(a).target, 225);}
  a.leg = "base"; assert.deepEqual(speedProfile(a), {segment: "base", target: 190, minimum: 190, maximum: 190});
  onFinal(a, 7); assert.equal(speedProfile(a).target, 155);
  onFinal(a, 3); assert.equal(speedProfile(a).target, 155);
  onFinal(a, 1); assert.equal(speedProfile(a).target, 130);
  const cleared = {...targets, vref: null};
  state = applyEnvelope(state, {id: "clear-vref", time: 1, action: {kind: "edit", aircraftId: a.id, patch: {speedTargets: cleared, speedMode: "auto"}}}).state;
  assert.equal(state.aircraft[0].targetSpeed, 135, "paused edits update the target without moving the plane");
  assert.deepEqual(state.aircraft[0].position, a.position);
  assert.equal(state.aircraft[0].speedTargets?.base, 190, "clearing one phase preserves other settings");
  state = restoreExercise(exerciseSchema.parse(state)); assert.deepEqual(state.aircraft[0].speedTargets, cleared);
});

test("a global manual speed overrides phase targets until the configured profile is resumed", () => {
  let state = initialExercise(); state.aircraft[0].speedTargets = {final: 170, vref: 140}; onFinal(state.aircraft[0], 1);
  state = applyEnvelope(state, {id: "manual", time: 1, action: {kind: "maneuver", aircraftId: "demo-air", command: {type: "speed", value: 150}}}).state;
  assert.equal(state.aircraft[0].targetSpeed, 150);
  state = applyEnvelope(state, {id: "profile", time: 2, action: {kind: "edit", aircraftId: "demo-air", patch: {speedMode: "auto"}}}).state;
  assert.equal(state.aircraft[0].targetSpeed, 140); assert.equal(state.aircraft[0].speedTargets?.final, 170);
});

test("phase speeds validate at the API boundary and cannot be edited by students", () => {
  for (const value of [0, -1, 601, 150.5, Infinity, NaN, "180"]) assert.equal(speedTargetsSchema.safeParse({base: value}).success, false);
  assert.equal(speedTargetsSchema.safeParse({cruise: 250}).success, false);
  const action = {kind: "edit" as const, aircraftId: "demo-air", patch: {speedTargets: {inbound: 250, base: null}}};
  assert.equal(envelopeSchema.safeParse({id: "phase-config", time: 1, action}).success, true);
  assert.equal(menteeActionAllowed(action), false);
});

test("scenario setup preserves per-aircraft semi-auto settings for new sessions and scheduled spawns", () => {
  const seed = initialExercise().aircraft[0]; seed.mode = "heading"; seed.speedTargets = {inbound: 245, base: 185, vref: null};
  const definition = scenarioSchema.parse({...blankScenario(), aircraft: [{key: "air", initial: false, seed: seedFromAircraft(seed)}], events: [{id: "arrival", title: "Arrival", trigger: {type: "time", at: 0}, actions: [{type: "spawn", aircraftKey: "air"}]}]});
  const before = JSON.stringify(definition);
  const first = createScenarioExercise(definition, "one", "first"), second = createScenarioExercise(definition, "two", "second");
  assert.deepEqual(first.runtime.definition.aircraft[0].seed.speedTargets, seed.speedTargets);
  assert.deepEqual(second.runtime.definition.aircraft[0].seed.speedTargets, seed.speedTargets);
  const spawned = advanceScenario({...first.exercise, running: true}, first.runtime, 1, 1000).exercise.aircraft[0];
  assert.deepEqual(spawned.speedTargets, seed.speedTargets); assert.equal(spawned.targetSpeed, 245);
  assert.equal(second.exercise.aircraft.length, 0, "another session retains its independent spawn schedule");
  const snapshot = scenarioFromExercise({...first.exercise, aircraft: [seed]}, "Capture");
  assert.deepEqual(snapshot.aircraft[0].seed.speedTargets, seed.speedTargets);
  assert.equal(JSON.stringify(definition), before);
});
