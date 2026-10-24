import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {airportList, runwayEnds} from "./airports";
import {moveGround} from "./ground-movement";
import {DEFAULTS} from "./model";

test("a 35 kt exit turn brakes continuously rather than snapping to 20 kt", () => {
  const engine = engineFor({airport: "KDAL"}), angle = 55 * Math.PI / 180;
  for (const dt of [.01, .02, .05, .1]) {
    const a = {...engine.newAircraft("exit", false), mode: "taxi" as const, position: {x: 0, y: 0}, heading: 0, speed: 35, targetSpeed: 35, arrivalExit: {instruction: "automatic" as const, speed: 35}};
    moveGround(a, [{x: Math.sin(angle), y: Math.cos(angle)}, {x: 2, y: 2}], 0, dt, false, {speedLimit: Infinity, travelLimit: Infinity});
    assert.ok(a.speed >= 35 - DEFAULTS.acceleration * dt - 1e-8, `${dt}: ${a.speed}`);
    assert.ok(a.speed < 35, "turn still requests braking");
  }
});

test("recorded Swiss exit has bounded braking through every intermediate bend", () => {
  const engine = engineFor({airport: "KDAL"});
  const path = [{x: -.4159393135380007, y: .7051490162060878}, {x: -.44095, y: .72776}, {x: -.44374, y: .73026}, {x: -.44686, y: .73219}, {x: -.44978, y: .73352}, {x: -.45257, y: .73428}, {x: -.4551, y: .7348}, {x: -.45794, y: .73501}, {x: -.46116, y: .73469}, {x: -.4634, y: .73439}, {x: -.46629, y: .73348}, {x: -.46919, y: .73228}, {x: -.47143, y: .73103}, {x: -.47441, y: .72873}, {x: -.48914378463681046, y: .7144165386785188}, {x: -.4936585001322065, y: .7100306183455044}];
  const a = {...engine.newAircraft("swiss", false), mode: "taxi" as const, position: {...path[0]}, heading: 315.82903113585934, speed: 35, targetSpeed: 35, arrivalExit: {instruction: "automatic" as const, speed: 35}};
  let index = 1;
  for (let i = 0; i < 10000 && index < path.length; i++) {
    const before = a.speed;
    const moved = moveGround(a, path, index, .02, false, {speedLimit: Infinity, travelLimit: Infinity});
    assert.ok(Math.abs(a.speed - before) <= DEFAULTS.acceleration * .02 + 1e-8, `${index}: ${before} -> ${a.speed}`);
    index = moved.index;
  }
  assert.equal(index, path.length, "completes the mapped exit without orbiting");
  assert.deepEqual(a.position, path.at(-1));
});

test("leaving a 35 kt exit for ordinary taxi speed applies gradual braking", () => {
  const engine = engineFor({airport: "KDAL"});
  const a = {...engine.newAircraft("taxi", false), mode: "taxi" as const, position: {x: 0, y: 0}, heading: 0, speed: 35, targetSpeed: 15};
  for (let i = 0; i < 150; i++) {
    const before = a.speed;
    moveGround(a, [{x: 0, y: 1}], 0, .05, false, {speedLimit: Infinity, travelLimit: Infinity});
    assert.ok(Math.abs(a.speed - before) <= DEFAULTS.acceleration * .05 + 1e-8);
  }
  assert.equal(a.speed, 15);
});

test("a 35 kt aircraft anticipates a hold across short nodes and resumes only when released", () => {
  const engine = engineFor({airport: "KDAL"});
  const path = [{x: .02, y: 0}, {x: .04, y: 0}, {x: .06, y: 0, hold: true}, {x: .12, y: 0}];
  const a = {...engine.newAircraft("hold", false), mode: "taxi" as const, position: {x: 0, y: 0}, heading: 90, speed: 35, targetSpeed: 35, arrivalExit: {instruction: "automatic" as const, speed: 35}};
  let index = 0, held = false;
  for (let i = 0; i < 5000 && !held; i++) {
    const before = a.speed;
    ({index, held} = moveGround(a, path, index, .02, false, {speedLimit: Infinity, travelLimit: Infinity}));
    assert.ok(Math.abs(a.speed - before) <= DEFAULTS.acceleration * .02 + 1e-8);
    assert.ok(a.position.x <= .06, "does not cross the hold");
  }
  assert.equal(held, true); assert.equal(index, 2); assert.equal(a.speed, 0);
  a.releasedHold = index;
  for (let i = 0; i < 300; i++) ({index} = moveGround(a, path, index, .02, false, {speedLimit: Infinity, travelLimit: Infinity}));
  assert.ok(index > 2); assert.ok(a.position.x > .06); assert.ok(a.speed > 0);
});

for (const airport of airportList) test(`${airport.icao}: mapped runway exits brake continuously and finish without orbiting`, () => {
  const engine = engineFor({airport: airport.icao});
  for (const end of runwayEnds(airport)) for (const side of ["left", "right", "any"] as const) {
    const g = engine.runwayGeometry(end.id);
    const a = {...engine.newAircraft("exit", false), runway: end.id, position: {x: g.threshold.x + g.vector.x * .01, y: g.threshold.y + g.vector.y * .01}, heading: g.heading, speed: 35, targetSpeed: 35};
    const route = engine.runwayExitRoute(a, side);
    if (!route.path) continue; // Some directions have no mapped forward exit on this side.
    a.position = {...route.path[1]}; a.mode = "taxi";
    a.speed = a.targetSpeed = route.speed!;
    a.arrivalExit = {instruction: "automatic", speed: route.speed!};
    let index = 2, rotation = 0;
    for (let i = 0; i < 6000 && index < route.path.length; i++) {
      const before = a.speed, position = {...a.position}, heading = a.heading, oldIndex = index;
      ({index} = moveGround(a, route.path, index, .05, false, {speedLimit: Infinity, travelLimit: Infinity}));
      assert.ok(Math.abs(a.speed - before) <= DEFAULTS.acceleration * .05 + 1e-8, `${end.id}/${side}/${index}: ${before} -> ${a.speed}`);
      assert.ok(engine.distance(position, a.position) <= Math.max(before, a.speed) / 3600 * .05 + 1e-7, "no position jump");
      if (a.speed > 1) assert.ok(engine.distance(position, a.position) > 1e-7, `${end.id}/${side}/${index}: a moving speed cannot hide a stop at the endpoint`);
      rotation += Math.abs((a.heading - heading + 540) % 360 - 180);
      assert.ok(rotation < 360, `${end.id}/${side}/${index}: no orbit around a waypoint`);
      if (index !== oldIndex) rotation = 0;
    }
    assert.equal(index, route.path.length, `${end.id}/${side}: exit completes`);
    assert.equal(a.speed, 0);
    assert.deepEqual(a.position, route.path.at(-1));
  }
});
