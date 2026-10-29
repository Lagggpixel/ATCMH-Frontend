import assert from "node:assert/strict";
import test from "node:test";
import {bankTurnRate, bankTurnRadius, turnAircraft} from "./banked-turns";
import {advance, engineFor, restoreExercise} from "./engine";
import {DEFAULTS, type Aircraft, type Exercise} from "./model";
import {aircraftSchema, envelopeSchema, exerciseSchema, motionSchema} from "./protocol";
import {ReplayTimeline, replayDelta} from "./replays";

const difference = (a: number, b: number) => ((a - b + 540) % 360) - 180;
const near = (a: number, b: number, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test("Maximum-bank coordinated turns change rate with speed and radius with speed squared", () => {
  for (const speed of [80, 160, 250, 450]) {
    const a = {heading: 0, targetHeading: 120, speed, bankAngle: DEFAULTS.bankAngle};
    turnAircraft(a, 1);
    near(a.heading, 9.80665 * Math.tan(.33) / (speed * 1852 / 3600) * 180 / Math.PI);
    near(a.bankAngle, DEFAULTS.bankAngle);
  }
  near(bankTurnRate(160, DEFAULTS.bankAngle), bankTurnRate(320, DEFAULTS.bankAngle) * 2);
  near(bankTurnRadius(320), bankTurnRadius(160) * 4);
  near(bankTurnRate(160, -DEFAULTS.bankAngle), -bankTurnRate(160, DEFAULTS.bankAngle));
});

for (const speed of [80, 160, 250, 450]) for (const [start, target] of [[0, 90], [90, 0], [350, 20], [10, 340], [0, 180], [0, 1]] as const) {
  test(`roll-in/out reaches ${start} to ${target} at ${speed} knots without overshooting or exceeding bank limits`, () => {
    const a = {heading: start, targetHeading: target, speed, bankAngle: 0};
    const direction = Math.sign(difference(target, start));
    let maximum = 0;
    for (let t = 0; t < 250; t += .05) {
      const bank = a.bankAngle, error = Math.abs(difference(target, a.heading));
      turnAircraft(a, .05);
      assert.ok(Math.abs(a.bankAngle) <= DEFAULTS.bankAngle + 1e-9);
      assert.ok(Math.abs(a.bankAngle - bank) <= 6 * .05 + 1e-9);
      assert.ok(Math.abs(difference(target, a.heading)) <= error + 1e-6, "normal rollout does not pass the assigned heading");
      assert.ok(a.bankAngle * direction >= -1e-5);
      maximum = Math.max(maximum, Math.abs(a.bankAngle));
      if (error < 1e-6 && Math.abs(bank) < 1e-4) break;
    }
    near(difference(a.heading, target), 0);
    near(a.bankAngle, 0, 1e-3);
    if (Math.abs(difference(target, start)) >= 90) near(maximum, DEFAULTS.bankAngle);
  });
}

test("observed 090 to 180 turn at 220 KIAS and 7000 ft completes in about 62 seconds", () => {
  const a = {heading: 90, targetHeading: 180, speed: 220, altitude: 7000, performanceProfile: "A320" as const, bankAngle: 0};
  let elapsed = 0, maximum = 0;
  while (elapsed < 100 && (Math.abs(difference(a.targetHeading, a.heading)) > .001 || Math.abs(a.bankAngle) > .001)) {
    turnAircraft(a, .05); elapsed += .05; maximum = Math.max(maximum, a.bankAngle);
  }
  near(elapsed, 62, .1); near(maximum, DEFAULTS.bankAngle);
  near(a.heading, 180, .001); near(a.bankAngle, 0, .001);
});

test("the exercise engine completes the observed turn with a modeled aircraft", () => {
  const e = engineFor({trainingStation: "EGPH:approach"});
  const a: Aircraft = {...e.newAircraft("timing", true), performanceProfile: "A320", mode: "heading", heading: 90, targetHeading: 180,
    speed: 220, targetSpeed: 220, speedMode: "manual", altitude: 7000, bankAngle: 0};
  let state: Exercise = {...e.initialExercise(), running: true, autoReadback: false, aircraft: [a]};
  let elapsed = 0;
  while (elapsed < 100 && (Math.abs(difference(180, state.aircraft[0].heading)) > .001 || Math.abs(state.aircraft[0].bankAngle ?? 0) > .001)) {
    state = advance(state, .05); elapsed += .05;
  }
  near(elapsed, 62, .1); near(state.aircraft[0].heading, 180, .001); near(state.aircraft[0].bankAngle!, 0, .001);
  near(state.aircraft[0].speed, 220); near(state.aircraft[0].altitude, 7000);
});

test("old snapshots above the new bank limit roll back smoothly", () => {
  for (const sign of [-1, 1]) {
    const a = {heading: 90, targetHeading: 90 + sign * 90, speed: 220, bankAngle: sign * 25};
    for (let i = 0; i < 30; i++) {
      const before = a.bankAngle; turnAircraft(a, .05);
      assert.ok(Math.abs(a.bankAngle - before) <= .300001);
      assert.ok(Math.abs(a.bankAngle) <= Math.max(Math.abs(before), DEFAULTS.bankAngle) + 1e-9);
    }
    assert.ok(Math.abs(a.bankAngle) <= DEFAULTS.bankAngle + 1e-9);
  }
});

test("reversing a clearance rolls through wings level instead of snapping bank or heading", () => {
  const a = {heading: 0, targetHeading: 120, speed: 160, bankAngle: 0};
  turnAircraft(a, 6); near(a.bankAngle, DEFAULTS.bankAngle);
  a.targetHeading = 300;
  const before = a.heading;
  turnAircraft(a, .05); near(a.bankAngle, DEFAULTS.bankAngle - .3); assert.ok(a.heading > before, "momentum remains while rolling out");
  let negative = false;
  for (let i = 0; i < 200; i++) {const bank = a.bankAngle; turnAircraft(a, .05); assert.ok(Math.abs(a.bankAngle - bank) <= .3 + 1e-9); negative ||= a.bankAngle < 0;}
  assert.ok(negative);
});

for (const mode of ["local", "approach", "center"] as const) test(`${mode} authoritative flight, prediction and reload preserve bank`, () => {
  const e = engineFor({trainingStation: `EGPH:${mode}`});
  const a: Aircraft = {...e.newAircraft("a", true), mode: "heading", heading: 0, targetHeading: 90, speed: 160, targetSpeed: 160, speedMode: "manual"};
  const initial = {...e.initialExercise(), running: true, autoReadback: false, aircraft: [a]};
  const next = advance(initial, 2);
  near(next.aircraft[0].bankAngle!, 12);
  assert.ok(next.aircraft[0].heading > 0 && next.aircraft[0].heading < 6);
  const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(next))));
  near(restored.aircraft[0].bankAngle!, 12);
  assert.deepEqual(advance(restored, .75).aircraft, advance(next, .75).aircraft);
  const prediction = e.predictAircraft(next.aircraft, .75);
  const actual = advance(next, .75).aircraft;
  near(prediction[0].bankAngle!, actual[0].bankAngle!);
  near(prediction[0].heading, actual[0].heading);
  assert.deepEqual(prediction[0].position, actual[0].position);
  assert.equal(a.bankAngle, undefined, "prediction and flight do not mutate input state");
  assert.equal(motionSchema.parse(next).aircraft[0].bankAngle, next.aircraft[0].bankAngle);
});

test("bank is backward compatible, bounded and not a directly editable aircraft control", () => {
  const a = engineFor({}).newAircraft("a", true);
  assert.ok(aircraftSchema.safeParse(a).success);
  for (const bankAngle of [-25, 0, 25]) assert.ok(aircraftSchema.safeParse({...a, bankAngle}).success);
  for (const bankAngle of [-25.01, 25.01, NaN, Infinity]) assert.equal(aircraftSchema.safeParse({...a, bankAngle}).success, false);
  assert.equal(envelopeSchema.safeParse({id: "edit-bank", time: 0, action: {kind: "edit", aircraftId: a.id, patch: {bankAngle: 25}}}).success, false);
  const e = engineFor({}), ground = {...e.newAircraft("ground", false), bankAngle: 25};
  const state = {...e.initialExercise(), running: true, aircraft: [ground]};
  const next = advance(state, 1);
  assert.equal(next.aircraft[0].bankAngle, 0); assert.deepEqual(next.aircraft[0].position, ground.position);
  near(DEFAULTS.bankAngle * Math.PI / 180, .33); assert.equal(DEFAULTS.bankRate, 6);
});

test("replay interpolation includes continuous signed bank, including legacy wings-level states", () => {
  const e = engineFor({}), initial = {...e.initialExercise(), aircraft: [e.newAircraft("a", true)]};
  const next = {...initial, elapsed: 1, aircraft: [{...initial.aircraft[0], bankAngle: -6}]};
  const timeline = new ReplayTimeline(initial, [{at: 1, interpolate: true, delta: replayDelta(initial, next)}]);
  near(timeline.at(.5).aircraft[0].bankAngle!, -3);
});
