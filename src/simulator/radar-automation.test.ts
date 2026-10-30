import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor, restoreExercise} from "./engine";
import {getAirport} from "./airports";
import {approachGeometry, assignRadar, moveRadar} from "./radar";
import {assignRadarSpeed, automaticRadarTarget} from "./radar-speed";
import {GLIDESLOPE_DEVIATION_FEET, missedLocalizerReason} from "./radar-automation";
import {updateRouteConstraints} from "./command-navigation";
import {exerciseSchema} from "./protocol";
import {radioMessageText} from "./radio-audio";
import {SessionService} from "./server/session-service";
import {MemoryStore} from "./session-test-store";
import {ReplayTimeline, replayDelta} from "./replays";
import type {ApproachType} from "./model";

function fixture(station: "approach" | "center" = "approach", type: ApproachType = "ils", nm = 8, lateral = 0, angle = 0) {
  const engine = engineFor({airport: "EGPH", trainingStation: `EGPH:${station}`}), state = engine.initialExercise();
  state.running = true; state.autoReadback = true;
  const airport = getAirport(state), env = state.radarEnvironment!, a = state.aircraft[0];
  const p = env.approaches.find(p => p.type === type && p.runway === "24")!, g = approachGeometry(airport, p.runway);
  const glide = airport.elevation + 50 + nm * 6076.12 * Math.tan(p.glideAngle * Math.PI / 180);
  Object.assign(a, {position: {x: g.threshold.x - g.vector.x * nm - g.vector.y * lateral, y: g.threshold.y - g.vector.y * nm + g.vector.x * lateral},
    heading: (g.heading + angle + 360) % 360, targetHeading: (g.heading + angle + 360) % 360,
    altitude: glide - 150, speed: 250, targetSpeed: 250, speedMode: "auto"});
  delete a.radar!.report;
  assignRadar(a, {type: "expect-approach", approachId: p.id}, airport, env);
  assignRadar(a, {type: "vector", approachId: p.id}, airport, env);
  return {engine, state, airport, env, a, p, g, glide, step: (automatic = true, dt = .05) => moveRadar(a, dt, airport, env, [], automatic)};
}

for (const station of ["approach", "center"] as const) {
  test(`${station}: late glideslope deviation causes one explained MA, preserved in snapshots/replays`, () => {
    const f = fixture(station); f.step();
    assert.equal(f.a.radar!.localizer, true); assert.equal(f.a.radar!.clearanceAltitudeChecked, true);
    f.a.altitude = f.glide + GLIDESLOPE_DEVIATION_FEET + 10;
    f.step(false); assert.equal(f.a.radar!.navigation, "approach", "manual mode retains trainer control");
    f.step(); assert.equal(f.a.radar!.navigation, "missed");
    const before = structuredClone(f.state), result = f.engine.autoReadbacks(f.state, 1000, randomUUID), message = result.messages.at(-1)!;
    assert.equal(message.text, `${f.a.callsign}, executing missed approach`);
    assert.match(message.unableReason!, /Above glideslope after localizer/);
    assert.doesNotMatch(radioMessageText(message), /glideslope/);
    assert.equal(result.aircraft[0].radar!.missedReason, undefined);
    assert.equal(f.engine.autoReadbacks(f.engine.advance(result, 1), 2000, randomUUID).messages.length, result.messages.length);
    assert.equal(restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(result)))).messages.at(-1)!.unableReason, message.unableReason);
    assert.equal(new ReplayTimeline(before, [{sequence: 1, at: 0, delta: replayDelta(before, result), interpolate: false}]).at(0).messages.at(-1)!.unableReason, message.unableReason);
  });
  test(`${station}: small tracking deviations do not cause a spurious MA`, () => {
    const f = fixture(station); f.step(); f.a.altitude = f.glide + 20; f.step();
    assert.equal(f.a.radar!.navigation, "approach");
  });
  for (const side of [-1, 1]) for (const angle of [46, 50, 60]) test(`${station}: ${side * angle} degree intercept misses only after crossing final`, () => {
    const f = fixture(station, "ils", 8, side, side * angle);
    f.a.speed = f.a.targetSpeed = 180; f.a.speedMode = "manual";
    f.step(); assert.equal(f.a.radar!.navigation, "approach"); assert.notEqual(f.a.radar!.localizer, true);
    for (let i = 0; i < 1800 && f.a.radar!.navigation !== "missed"; i++) f.step();
    assert.equal(f.a.radar!.navigation, "missed"); assert.match(f.a.radar!.missedReason!, /intercept exceeds 45/);
  });
  for (const angle of [-45, 45]) test(`${station}: ${angle} degrees remains an allowed intercept`, () => {
    const f = fixture(station, "ils", 8, Math.sign(angle) * .1, angle); f.step();
    assert.equal(f.a.radar!.localizer, true); assert.notEqual(f.a.radar!.report, "missed");
  });
  for (const type of ["ils", "gps", "visual"] as const) test(`${station} ${type}: staged automatic speeds apply before capture and throughout final`, () => {
    for (const [nm, target] of [[25, 250], [15, 220], [10, 180], [5, 160], [3, 135], [1, 135]]) {
      const f = fixture(station, type, nm); f.step(); assert.equal(f.a.targetSpeed, target, `${nm} NM`);
      assert.ok(f.a.speed >= 249.8, "speed changes gradually");
    }
    const f = fixture(station, type, 8, 1, 60); f.step();
    assert.equal(f.a.radar!.captured, false); assert.equal(f.a.targetSpeed, automaticRadarTarget(f.a));
    const returning = fixture(station, type);
    Object.assign(returning.a.radar!, {flight: "departure"}); returning.step();
    assert.equal(returning.a.targetSpeed, 180, "an approach clearance also slows traffic originally spawned as a departure");
  });
  for (const type of ["ils", "gps", "visual"] as const) test(`${station} ${type}: actual speed decreases on the flown final`, () => {
    const f = fixture(station, type);
    for (let i = 0; i < 480; i++) f.step(true, .25);
    assert.equal(f.a.radar!.navigation, "approach");
    assert.equal(f.a.targetSpeed, 135); assert.ok(f.a.speed <= 150, `${f.a.speed} kt`);
  });
  test(`${station}: vectors slow before clearance, while explicit speed instructions persist`, () => {
    const f = fixture(station); assignRadar(f.a, {type: "expect-approach", approachId: null, vectors: true}, f.airport, f.env); f.step();
    assert.equal(f.a.targetSpeed, 180);
    for (const [relation, expected] of [["maximum", 180], ["minimum", 210], ["exact", 210]] as const) {
      assignRadarSpeed(f.a, {type: "radar-speed", mode: "maintain", unit: "knots", relation, value: 210}); f.step(); assert.equal(f.a.targetSpeed, expected);
    }
    assignRadarSpeed(f.a, {type: "radar-speed", mode: "discretion"}); f.step(); assert.equal(f.a.targetSpeed, 180);
  });
}
test("localizer crossing detection survives an entire skipped capture corridor and serialized state", () => {
  const f = fixture(); assert.equal(missedLocalizerReason(f.a, -8, 1, 60, 25), undefined);
  const restored = exerciseSchema.parse(JSON.parse(JSON.stringify(f.state))).aircraft[0];
  assert.match(missedLocalizerReason(restored, -7, -1, 60, 25)!, /60.*45/);
  assignRadar(f.a, {type: "vector", heading: 90}, f.airport, f.env); assert.equal(f.a.radar!.localizerIntercept, undefined);
});
test("trainer repositioning across final is not mistaken for a flown localizer crossing", () => {
  const f = fixture("approach", "ils", 8, 1, 60); f.step();
  const position = {x: f.g.threshold.x - f.g.vector.x * 8 + f.g.vector.y, y: f.g.threshold.y - f.g.vector.y * 8 - f.g.vector.x};
  const result = f.engine.applyEnvelope(f.state, {id: randomUUID(), time: 0, action: {kind: "edit", aircraftId: f.a.id, patch: {position}}});
  assert.equal(result.error, undefined);
  moveRadar(result.state.aircraft[0], .05, f.airport, f.env, [], true);
  assert.equal(result.state.aircraft[0].radar!.navigation, "approach");
});
test("a waypoint speed constraint does not create a permanent manual override on final", () => {
  const f = fixture(); f.a.radar!.navigation = "route"; f.a.starDescent = true;
  f.a.flightPlan = [{x: 20, y: 20, speed: 230}]; updateRouteConstraints(f.a);
  assert.equal(f.a.speedMode, "auto");
  assignRadar(f.a, {type: "vector", approachId: f.p.id}, f.airport, f.env); f.step(); assert.equal(f.a.targetSpeed, 180);
});
test("configured final speeds, aircraft limits and deliberate manual overrides remain effective", () => {
  for (const type of ["ils", "gps", "visual"] as const) {
    const f = fixture("approach", type, 1); f.a.speedTargets = {final: 170, vref: 145}; f.step(); assert.equal(f.a.targetSpeed, 145);
    f.a.type = "B772"; f.step(); assert.equal(f.a.targetSpeed, 150, "heavy landing minimum");
    f.a.type = "A320"; f.a.speedMode = "manual"; f.a.targetSpeed = 210; f.step(); assert.equal(f.a.targetSpeed, 210);
    assignRadarSpeed(f.a, {type: "radar-speed", mode: "discretion"}); f.step(); assert.equal(f.a.targetSpeed, 145);
  }
});
for (const type of ["ils", "gps", "visual"] as const) test(`${type}: reaching the runway without completing the approach logs its reason once`, () => {
  const f = fixture("approach", type, .01);
  Object.assign(f.a.radar!, {captured: true, localizer: true, glideslope: true, clearanceAltitudeChecked: true});
  f.a.altitude = f.airport.elevation + 50; f.step(false);
  assert.equal(f.a.radar!.navigation, "missed");
  const result = f.engine.autoReadbacks(f.state, 1000, randomUUID);
  assert.match(result.messages.at(-1)!.unableReason!, /Reached the runway/);
});
test("a Tower missed approach retains its explanation through reporting and frequency changes", () => {
  const f = fixture("approach", "ils", .5); f.a.frequency = "tower"; f.a.radar!.transferred = true;
  f.a.altitude = f.glide + 300; f.step();
  let state = f.state;
  for (let i = 0; i < 100; i++) state = f.engine.autoReadbacks(f.engine.advance(state, .5), i * 500, randomUUID);
  const reports = state.messages.filter(m => m.text.includes("executing missed approach"));
  assert.equal(reports.length, 1); assert.match(reports[0].unableReason!, /Above glideslope/);
  assert.equal(state.aircraft[0].radar!.missedReason, undefined);
});
test("learner joins and frames omit both pending and logged MA reasons; trainer reconnect retains them", async () => {
  for (const logged of [false, true]) {
    const f = fixture(); f.a.altitude = f.glide + 200; f.step();
    const state = logged ? f.engine.autoReadbacks(f.state, 1000, randomUUID) : f.state;
    state.callsignReservations = [{id: "future", callsign: "Future 9"}];
    const service = new SessionService(new MemoryStore(), () => 1000), staff = {accountId: "mentor", staff: true};
    const session = await service.create(staff, "Missed reasons", state), token = randomUUID();
    const learner = {accountId: "learner", staff: false, learnerSession: session.id};
    for (const view of [await service.join(learner, session.id, "mentee", token), await service.frame(learner, session.id, "mentee", token)]) {
      assert.doesNotMatch(JSON.stringify(view), /Above glideslope/);
      assert.equal(view.exercise.aircraft[0].radar!.missedReason, undefined);
      assert.equal(view.exercise.callsignReservations, undefined);
    }
    const mentor = await service.join(staff, session.id, "staff", randomUUID());
    assert.match(JSON.stringify(mentor), /Above glideslope/);
    assert.equal(mentor.exercise.callsignReservations?.[0].callsign, "Future 9");
  }
});
