import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {getAirport} from "./airports";
import {approachGeometry, moveRadar} from "./radar";
import {assignRadarSpeed} from "./radar-speed";

function fixture(station: "approach" | "center") {
  const state = engineFor({airport: "EGLL", trainingStation: `EGLL:${station}`}).initialExercise();
  const airport = getAirport(state), env = state.radarEnvironment!, a = state.aircraft[0];
  const approach = env.approaches.find(p => p.type === "ils" && p.runway === "27R")!;
  const g = approachGeometry(airport, approach.runway, approach);
  Object.assign(a, {type: "A320", runway: approach.runway, mode: "heading", speed: 220, targetSpeed: 220, speedMode: "auto", altitude: 3000});
  Object.assign(a.radar!, {navigation: "heading", expected: approach.id, flight: "return"});
  delete a.radar!.departure; delete a.radar!.cleared; delete a.radar!.speed;
  const position = (along: number, lateral: number) => ({x: g.threshold.x + g.vector.x * along - g.vector.y * lateral, y: g.threshold.y + g.vector.y * along + g.vector.x * lateral});
  const step = (seconds = .1) => moveRadar(a, seconds, airport, env);
  return {a, g, approach, env, position, step};
}

for (const station of ["approach", "center"] as const) {
  test(`${station}: downwind and base vectors do not select final speeds by runway proximity`, () => {
    for (const lateral of [-4, 4]) for (const angle of [180, 90, -90]) {
      const f = fixture(station);
      Object.assign(f.a, {position: f.position(-1, lateral), heading: (f.g.heading + angle + 360) % 360, targetHeading: (f.g.heading + angle + 360) % 360});
      f.step(); assert.equal(f.a.targetSpeed, station === "center" ? 340 : 250, `${lateral} NM lateral, ${angle} degrees`);
      assert.ok(f.a.speed > 220, "aircraft accelerates toward the inbound target");
    }
  });
  test(`${station}: a returning departure beyond the runway does not select landing speeds`, () => {
    const f = fixture(station);
    Object.assign(f.a, {position: f.position(2, 0), heading: f.g.heading, targetHeading: f.g.heading});
    f.step(); assert.equal(f.a.targetSpeed, station === "center" ? 340 : 250); assert.ok(f.a.speed > 220);
  });
  test(`${station}: final alignment enables staged speeds and respects controller restrictions`, () => {
    const f = fixture(station);
    Object.assign(f.a, {position: f.position(-4, 4), heading: (f.g.heading + 180) % 360, targetHeading: (f.g.heading + 180) % 360});
    assignRadarSpeed(f.a, {type: "radar-speed", mode: "maintain", unit: "knots", relation: "maximum", value: 210});
    f.step(); assert.equal(f.a.targetSpeed, 210);
    Object.assign(f.a, {position: f.position(-4, 0), heading: f.g.heading, targetHeading: f.g.heading});
    f.step(); assert.equal(f.a.targetSpeed, 160); assert.ok(f.a.speed > 160, "deceleration remains gradual");
    assignRadarSpeed(f.a, {type: "radar-speed", mode: "maintain", unit: "knots", relation: "minimum", value: 210});
    f.step(); assert.equal(f.a.targetSpeed, 210);
    assignRadarSpeed(f.a, {type: "radar-speed", mode: "maintain", unit: "knots", relation: "exact", value: 200});
    f.step(); assert.equal(f.a.targetSpeed, 200);
    assignRadarSpeed(f.a, {type: "radar-speed", mode: "discretion"});
    f.step(); assert.equal(f.a.targetSpeed, 160);
  });
  test(`${station}: a cleared visual join selects approach speed while turning onto final`, () => {
    const f = fixture(station), visual = f.env.approaches.find(p => p.type === "visual" && p.runway === "27R")!;
    Object.assign(f.a, {position: f.position(-4, 2), heading: (f.g.heading + 270) % 360, targetHeading: (f.g.heading + 270) % 360});
    Object.assign(f.a.radar!, {navigation: "approach", expected: visual.id, cleared: visual.id, captured: false});
    f.step(); assert.equal(f.a.targetSpeed, 160);
  });
  test(`${station}: a captured landing retains final speed after crossing the threshold`, () => {
    const f = fixture(station);
    Object.assign(f.a, {position: f.position(.02, 0), heading: f.g.heading, targetHeading: f.g.heading, frequency: "tower", speed: 135, targetSpeed: 135});
    Object.assign(f.a.radar!, {navigation: "approach", cleared: f.approach.id, captured: true, transferred: true});
    f.step(); assert.equal(f.a.targetSpeed, 135);
  });
}
